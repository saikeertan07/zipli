const { pool } = require('../../src/config/db');
const { ledgerService } = require('../../src/services/ledger.service');

describe('Double-Entry Balanced General Ledger (F-051, FIN-LE-01)', () => {
  const testOrderId = `test_ord_${Date.now()}`;

  afterAll(async () => {
    // Note: Do not truncate or delete ledger lines as immutability trigger protects them.
    // Clean up non-immutable test artifacts if needed.
  });

  describe('Order Payment Balanced Journal Entries', () => {
    it('successfully posts balanced journal entry for standard order with delivery, tip, and taxes', async () => {
      // Order scenario:
      // Items: ₹400 (40000 paise), Commission (10%): ₹40 (4000 paise) -> Store payable: ₹360 (36000 paise)
      // Delivery fee: ₹25 (2500 paise)
      // Rider Tip: ₹20 (2000 paise)
      // GST: ₹20 (2000 paise)
      // Discount: ₹50 (5000 paise)
      // Shopper Net Paid: ₹400 - ₹50 + ₹25 + ₹20 + ₹20 = ₹415 (41500 paise)
      //
      // Balance check:
      // Debits: 41500 (clearing) + 5000 (promotional_expense) = 46500 paise
      // Credits: 36000 (store_payable) + 4000 (platform_revenue) + 2500 (delivery) + 2000 (tip) + 2000 (tax) = 46500 paise!

      const entry = await ledgerService.recordOrderPayment({
        orderId: `${testOrderId}_1`,
        orderTotalPaise: 41500,
        itemsPaise: 40000,
        commissionPaise: 4000,
        deliveryFeePaise: 2500,
        tipPaise: 2000,
        gstPaise: 2000,
        discountPaise: 5000,
        paymentMethod: 'GATEWAY',
      });

      expect(entry.id).toBeDefined();
      expect(entry.entry_number).toBeDefined();
      expect(entry.lines.length).toBe(7);

      const debits = entry.lines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const credits = entry.lines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(debits).toBe(46500);
      expect(credits).toBe(46500);
    });

    it('rejects order payment if input parameters are mathematically unbalanced', async () => {
      await expect(
        ledgerService.recordOrderPayment({
          orderId: `${testOrderId}_unbalanced`,
          orderTotalPaise: 40000, // Deliberately 1000 paise lower than components
          itemsPaise: 40000,
          commissionPaise: 4000,
          deliveryFeePaise: 2500,
          tipPaise: 0,
          gstPaise: 0,
          discountPaise: 0,
        })
      ).rejects.toThrow(/unbalanced/i);
    });
  });

  describe('Order Refund Balanced Journal Entries', () => {
    it('successfully posts reversing journal entry for partial refund', async () => {
      // Refund: ₹100 (10000 paise)
      // Store deduction: ₹80 (8000 paise)
      // Platform commission reversed: ₹10 (1000 paise)
      // Tax reversed: ₹10 (1000 paise)
      // Total Debits = 10000 paise, Total Credits (to clearing) = 10000 paise.

      const refundEntry = await ledgerService.recordOrderRefund({
        orderId: `${testOrderId}_1`,
        refundTotalPaise: 10000,
        storeDeductionPaise: 8000,
        platformDeductionPaise: 1000,
        taxDeductionPaise: 1000,
        refundTarget: 'GATEWAY',
        reason: 'Customer reported damaged fruit',
      });

      expect(refundEntry.id).toBeDefined();
      expect(refundEntry.lines.length).toBe(4);

      const debits = refundEntry.lines.reduce((s, l) => s + Number(l.debit_paise), 0);
      const credits = refundEntry.lines.reduce((s, l) => s + Number(l.credit_paise), 0);
      expect(debits).toBe(10000);
      expect(credits).toBe(10000);
    });
  });

  describe('Database Trigger & Constraint Enforcement', () => {
    it('blocks committing an unbalanced entry directly at the PostgreSQL trigger level', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const entryRes = await client.query(
          `INSERT INTO ledger_journal_entries (reference_type, reference_id, description)
           VALUES ('RAW_TEST', '123', 'Direct DB test') RETURNING id`
        );
        const entryId = entryRes.rows[0].id;

        // Insert unbalanced lines directly: 5000 debit vs 4000 credit
        await client.query(
          `INSERT INTO ledger_lines (entry_id, account_code, debit_paise, credit_paise)
           VALUES ($1, 'gateway_clearing', 5000, 0)`,
          [entryId]
        );
        await client.query(
          `INSERT INTO ledger_lines (entry_id, account_code, debit_paise, credit_paise)
           VALUES ($1, 'platform_revenue', 0, 4000)`,
          [entryId]
        );

        // COMMIT will trigger the deferred constraint trigger and must throw
        await expect(client.query('COMMIT')).rejects.toThrow(/unbalanced/i);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });

    it('blocks committing an entry with fewer than 2 lines at the trigger level', async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const entryRes = await client.query(
          `INSERT INTO ledger_journal_entries (reference_type, reference_id, description)
           VALUES ('SINGLE_LINE', '456', 'Single line test') RETURNING id`
        );
        const entryId = entryRes.rows[0].id;

        await client.query(
          `INSERT INTO ledger_lines (entry_id, account_code, debit_paise, credit_paise)
           VALUES ($1, 'gateway_clearing', 1000, 0)`,
          [entryId]
        );

        await expect(client.query('COMMIT')).rejects.toThrow(/at least 2 lines/i);
      } finally {
        await client.query('ROLLBACK').catch(() => {});
        client.release();
      }
    });

    it('enforces immutability: blocks direct UPDATE or DELETE on ledger records', async () => {
      const { rows } = await pool.query('SELECT id, entry_id FROM ledger_lines LIMIT 1');
      if (rows.length > 0) {
        const lineId = rows[0].id;
        const entryId = rows[0].entry_id;

        // Attempting to UPDATE line
        await expect(
          pool.query('UPDATE ledger_lines SET debit_paise = debit_paise + 100 WHERE id = $1', [lineId])
        ).rejects.toThrow(/immutable/i);

        // Attempting to DELETE line
        await expect(
          pool.query('DELETE FROM ledger_lines WHERE id = $1', [lineId])
        ).rejects.toThrow(/immutable/i);

        // Attempting to UPDATE entry header
        await expect(
          pool.query('UPDATE ledger_journal_entries SET description = $1 WHERE id = $2', ['Hacked', entryId])
        ).rejects.toThrow(/immutable/i);

        // Attempting to DELETE entry header
        await expect(
          pool.query('DELETE FROM ledger_journal_entries WHERE id = $1', [entryId])
        ).rejects.toThrow(/immutable/i);
      }
    });
  });

  describe('Trial Balance Verification', () => {
    it('verifies that the entire ledger maintains a strictly balanced zero-sum state', async () => {
      const trialBalance = await ledgerService.getTrialBalance();

      expect(trialBalance.isBalanced).toBe(true);
      expect(trialBalance.differencePaise).toBe(0);
      expect(trialBalance.totalDebitsPaise).toBe(trialBalance.totalCreditsPaise);
      expect(trialBalance.accounts.length).toBeGreaterThanOrEqual(10);
    });
  });
});
