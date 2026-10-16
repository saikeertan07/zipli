const {
  GENESIS_HASH,
  canonicalizeJson,
  sha256,
  extractRecordFields,
  computeRecordHash,
  createAuditRecord,
  verifyAuditChain,
} = require('../../src/algo/hashChain');

describe('hashChain.js pure cryptographic immutable audit hash chain', () => {
  describe('canonicalizeJson and sha256', () => {
    it('canonicalizes JSON deterministically irrespective of key insertion order', () => {
      const obj1 = { b: 2, a: 1, c: { z: 9, y: 8 } };
      const obj2 = { a: 1, c: { z: 9, y: 8 }, b: 2 };
      expect(canonicalizeJson(obj1)).toBe(canonicalizeJson(obj2));

      expect(canonicalizeJson(null)).toBe('{}');
      expect(canonicalizeJson(undefined)).toBe('{}');
      expect(canonicalizeJson('simple_string')).toBe('"simple_string"');
      expect(canonicalizeJson([3, 2, 1])).toBe('[3,2,1]');
    });

    it('produces valid 64-character SHA-256 hex digest', () => {
      const digest = sha256('hello world');
      expect(digest).toHaveLength(64);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('extractRecordFields', () => {
    it('normalizes camelCase and snake_case properties with sensible defaults', () => {
      const defaults = extractRecordFields();
      expect(defaults.prev_hash).toBe(GENESIS_HASH);
      expect(defaults.id).toBe('0');
      expect(defaults.admin_id).toBe('SYSTEM');
      expect(defaults.action).toBe('UNKNOWN');
      expect(defaults.target_type).toBe('GENERAL');
      expect(defaults.target_id).toBe('NONE');
      expect(defaults.created_at).toBe('0');

      const snake = extractRecordFields({
        id: 10,
        admin_id: 'admin_1',
        action: 'UPDATE',
        target_type: 'ORDER',
        target_id: 'ord_99',
        prev_hash: 'abc',
        current_hash: 'def',
        created_at: '2025-01-01',
      });
      expect(snake.id).toBe('10');
      expect(snake.admin_id).toBe('admin_1');
      expect(snake.target_type).toBe('ORDER');
      expect(snake.target_id).toBe('ord_99');
      expect(snake.prev_hash).toBe('abc');

      const camel = extractRecordFields({
        id: 20,
        adminId: 'admin_2',
        action: 'DELETE',
        targetType: 'PRODUCT',
        targetId: 'prod_5',
        prevHash: '123',
        currentHash: '456',
        createdAt: new Date('2025-01-01T00:00:00Z'),
      });
      expect(camel.admin_id).toBe('admin_2');
      expect(camel.target_type).toBe('PRODUCT');
      expect(camel.target_id).toBe('prod_5');
      expect(camel.prev_hash).toBe('123');
      expect(camel.created_at).toBe('2025-01-01T00:00:00.000Z');
    });
  });

  describe('createAuditRecord and computeRecordHash', () => {
    it('creates genesis record using GENESIS_HASH when prior record is null or missing hash', () => {
      const now = new Date();
      const genesis = createAuditRecord(null, {
        id: 1,
        adminId: 10,
        action: 'PRODUCT_PRICE_OVERRIDE',
        targetType: 'PRODUCT',
        targetId: 55,
        payload: { oldPrice: 50, newPrice: 45 },
        createdAt: now,
      });

      expect(genesis.prev_hash).toBe(GENESIS_HASH);
      expect(genesis.current_hash).toHaveLength(64);
      expect(genesis.current_hash).toBe(computeRecordHash(genesis));

      const emptyPrior = createAuditRecord({}, { id: 2, action: 'TEST' });
      expect(emptyPrior.prev_hash).toBe(GENESIS_HASH);
    });

    it('creates subsequent linked records referencing prior current_hash', () => {
      const genesis = createAuditRecord(null, {
        id: 1,
        action: 'USER_REGISTER',
        targetType: 'USER',
        payload: {},
        createdAt: '2024-01-01T00:00:00Z',
      });

      const second = createAuditRecord(genesis, {
        id: 2,
        action: 'USER_ROLE_PROMOTION',
        targetType: 'USER',
        payload: { newRole: 'admin' },
        createdAt: '2024-01-01T01:00:00Z',
      });

      expect(second.prev_hash).toBe(genesis.current_hash);
      expect(second.current_hash).toHaveLength(64);
    });

    it('handles defaults when optional fields are omitted in computeRecordHash', () => {
      const hash = computeRecordHash({ id: 100 });
      expect(hash).toHaveLength(64);
    });
  });

  describe('verifyAuditChain validation and tamper detection', () => {
    it('returns valid for empty records array or non-array', () => {
      const res = verifyAuditChain([]);
      expect(res.isValid).toBe(true);
      expect(res.verifiedCount).toBe(0);

      const resNull = verifyAuditChain(null);
      expect(resNull.isValid).toBe(true);
    });

    it('verifies valid sequential chain with multiple records', () => {
      const chain = [];
      let prior = null;

      for (let i = 1; i <= 5; i++) {
        const record = createAuditRecord(prior, {
          id: i,
          adminId: 1,
          action: `ACTION_${i}`,
          targetType: 'SYSTEM',
          targetId: String(i),
          payload: { step: i },
          createdAt: `2024-01-0${i}T00:00:00Z`,
        });
        chain.push(record);
        prior = record;
      }

      const res = verifyAuditChain(chain);
      expect(res.isValid).toBe(true);
      expect(res.verifiedCount).toBe(5);
      expect(res.tamperedRowId).toBeNull();
    });

    it('detects invalid genesis record with non-zero prev_hash', () => {
      const fakeGenesis = {
        id: 1,
        prev_hash: '1'.repeat(64),
        action: 'INIT',
        payload: {},
        createdAt: '2024-01-01T00:00:00Z',
      };
      fakeGenesis.current_hash = computeRecordHash(fakeGenesis);

      const res = verifyAuditChain([fakeGenesis]);
      expect(res.isValid).toBe(false);
      expect(res.brokenIndex).toBe(0);
      expect(res.tamperedRowId).toBe('1');
      expect(res.reason).toMatch(/Genesis record prev_hash does not match/);
    });

    it('detects broken chain link where prev_hash does not match prior current_hash', () => {
      const genesis = createAuditRecord(null, {
        id: 1,
        action: 'INIT',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const second = createAuditRecord(genesis, {
        id: 2,
        action: 'STEP_2',
        createdAt: '2024-01-02T00:00:00Z',
      });

      // Break chain link
      second.prev_hash = 'f'.repeat(64);
      second.current_hash = computeRecordHash(second);

      const res = verifyAuditChain([genesis, second]);
      expect(res.isValid).toBe(false);
      expect(res.brokenIndex).toBe(1);
      expect(res.tamperedRowId).toBe('2');
      expect(res.reason).toMatch(/Broken chain link/);
    });

    it('detects tampered payload content within a row', () => {
      const genesis = createAuditRecord(null, {
        id: 1,
        action: 'INIT',
        createdAt: '2024-01-01T00:00:00Z',
      });

      const second = createAuditRecord(genesis, {
        id: 2,
        action: 'TRANSFER_FUNDS',
        payload: { amount: 50 },
        createdAt: '2024-01-02T00:00:00Z',
      });

      // Silently tamper payload without updating current_hash
      second.payload = { amount: 500000 };

      const res = verifyAuditChain([genesis, second]);
      expect(res.isValid).toBe(false);
      expect(res.brokenIndex).toBe(1);
      expect(res.tamperedRowId).toBe('2');
      expect(res.reason).toMatch(/Tampered content at row/);
    });
  });
});
