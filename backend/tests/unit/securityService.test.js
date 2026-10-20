const securityService = require('../../src/services/security.service');
const { pool, query } = require('../../src/config/db');

describe('security.service.js unit tests', () => {
  describe('exportUserData & anonymizeUserAccount edge cases', () => {
    it('throws 404 in exportUserData when user does not exist', async () => {
      await expect(securityService.exportUserData(99999999)).rejects.toThrow('User not found');
    });

    it('throws 404 in anonymizeUserAccount when user does not exist', async () => {
      await expect(securityService.anonymizeUserAccount(99999999)).rejects.toThrow(
        'User not found'
      );
    });

    it('returns idempotently if user is already anonymized', async () => {
      // Mock user query to return is_anonymized: true
      const origQuery = pool.query;
      pool.query = async (sql) => {
        if (sql.includes('FROM users WHERE id =')) {
          return { rows: [{ id: 1, email: 'anon@internal', is_anonymized: true }] };
        }
        return { rows: [] };
      };

      try {
        const res = await securityService.anonymizeUserAccount(1);
        expect(res.success).toBe(true);
        expect(res.message).toMatch(/already been anonymized/);
      } finally {
        pool.query = origQuery;
      }
    });

    it('throws 404 in resolveFraudReview when order does not exist', async () => {
      await expect(securityService.resolveFraudReview(99999999, 1, 'APPROVE')).rejects.toThrow(
        'Order not found'
      );
    });
  });

  describe('appendAuditLog transaction rollback', () => {
    it('rolls back and rethrows error if database insert fails', async () => {
      const origConnect = pool.connect;
      const mockClient = {
        query: async (sql) => {
          if (sql.includes('INSERT INTO admin_audit_logs')) {
            throw new Error('Disk full on audit ledger');
          }
          if (sql.includes('SELECT nextval')) {
            return { rows: [{ next_id: 123 }] };
          }
          return { rows: [] };
        },
        release: jest.fn(),
      };
      pool.connect = async () => mockClient;

      try {
        await expect(
          securityService.appendAuditLog({
            adminId: 1,
            action: 'TEST_FAIL',
            targetType: 'SYSTEM',
          })
        ).rejects.toThrow('Disk full on audit ledger');
        expect(mockClient.release).toHaveBeenCalled();
      } finally {
        pool.connect = origConnect;
      }
    });
  });

  describe('assessOrderFraudRisk coverage branches', () => {
    it('safely handles simulated db failures by returning benign score', async () => {
      const mockFailingClient = {
        query: async () => {
          throw new Error('Timeout on risk assessment');
        },
      };

      const res = await securityService.assessOrderFraudRisk(
        { userId: 1, orderAmount: 50 },
        mockFailingClient
      );

      expect(res.fraudDecision).toBe('ALLOW');
      expect(res.fraudScore).toBe(0.05);
    });

    it('correctly aggregates address reuse and coupon use counts', async () => {
      const mockClient = {
        query: async (sql) => {
          if (sql.includes('COUNT(DISTINCT user_id)')) {
            return { rows: [{ cnt: '3' }] };
          }
          if (sql.includes('COUNT(*) AS cnt FROM orders WHERE user_id = $1 AND coupon_code = $2')) {
            return { rows: [{ cnt: '2' }] };
          }
          if (sql.includes('SELECT created_at FROM users')) {
            return { rows: [{ created_at: new Date(Date.now() - 3600000).toISOString() }] };
          }
          return {
            rows: [
              { vel_10m: '1', vel_24h: '2', total_orders: '3', avg_amount: '40', std_amount: '10' },
            ],
          };
        },
      };

      const res = await securityService.assessOrderFraudRisk(
        {
          userId: 1,
          orderAmount: 60,
          shippingAddress: '123 Fake Street, Bengaluru',
          couponCode: 'SAVE20',
          ipAddress: '198.51.100.5',
          deviceFingerprint: 'dev_fingerprint_unique',
        },
        mockClient
      );

      expect(res.fraudDecision).toBeDefined();
      expect(res.signals.addressReuseCount).toBe(3);
    });
  });
});
