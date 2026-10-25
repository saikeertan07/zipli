/**
 * @file ledgerServiceExtra.test.js
 * @description Unit branch coverage tests for LedgerService methods and error handling paths.
 */

const { ledgerService } = require('../../src/services/ledger.service');

describe('LedgerService Branch Coverage & Boundary Validation', () => {
  it('throws 400 when orderId is missing in recordOrderPayment', async () => {
    await expect(
      ledgerService.recordOrderPayment({
        orderTotalPaise: 1000,
        itemsPaise: 1000,
      })
    ).rejects.toThrow('orderId is required');
  });

  it('throws 400 when commission exceeds gross item sales value', async () => {
    await expect(
      ledgerService.recordOrderPayment({
        orderId: 999,
        orderTotalPaise: 1000,
        itemsPaise: 1000,
        commissionPaise: 1500, // Exceeds itemsPaise
      })
    ).rejects.toThrow('Commission cannot exceed gross item sales value');
  });

  it('throws 400 when refund debits do not match credits', async () => {
    await expect(
      ledgerService.recordOrderRefund({
        orderId: 999,
        refundTotalPaise: 5000,
        storeDeductionPaise: 2000, // Only 2000 debits for 5000 credits
      })
    ).rejects.toThrow('Refund entry unbalanced');
  });

  it('throws 400 when journal entry has fewer than 2 lines', async () => {
    await expect(
      ledgerService.postJournalEntry({
        referenceType: 'MANUAL',
        referenceId: '1',
        description: 'Test entry',
        lines: [{ account_code: 'store_payable', debit_paise: 100, credit_paise: 0 }],
      })
    ).rejects.toThrow('Journal entry must contain at least 2 balanced lines');
  });

  it('throws 400 when arbitrary journal entry is unbalanced', async () => {
    await expect(
      ledgerService.postJournalEntry({
        referenceType: 'MANUAL',
        referenceId: '1',
        description: 'Test entry',
        lines: [
          { account_code: 'store_payable', debit_paise: 100, credit_paise: 0 },
          { account_code: 'gateway_clearing', debit_paise: 0, credit_paise: 50 },
        ],
      })
    ).rejects.toThrow('Unbalanced journal entry');
  });

  it('handles WALLET and COD payment clearing accounts correctly', async () => {
    const mockClient = {
      query: jest.fn().mockImplementation((sql, params) => {
        if (sql.includes('INSERT INTO ledger_journal_entries')) {
          return Promise.resolve({ rows: [{ id: 'mock-journal-entry-uuid', entry_number: 101 }] });
        }
        if (sql.includes('INSERT INTO ledger_lines')) {
          return Promise.resolve({
            rows: [{ id: 'mock-line-uuid', account_code: params ? params[1] : 'unknown' }],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
    };

    // WALLET payment
    const walletRes = await ledgerService.recordOrderPayment(
      {
        orderId: 501,
        orderTotalPaise: 5000,
        itemsPaise: 4000,
        commissionPaise: 800,
        deliveryFeePaise: 500,
        gstPaise: 500,
        paymentMethod: 'WALLET',
      },
      mockClient
    );
    expect(walletRes.lines.some((l) => l.account_code === 'customer_wallet')).toBe(true);

    // COD payment
    const codRes = await ledgerService.recordOrderPayment(
      {
        orderId: 502,
        orderTotalPaise: 5000,
        itemsPaise: 4000,
        commissionPaise: 800,
        deliveryFeePaise: 500,
        gstPaise: 500,
        paymentMethod: 'COD',
      },
      mockClient
    );
    expect(codRes.lines.some((l) => l.account_code === 'cash_in_transit')).toBe(true);
  });

  it('computes account balance for DEBIT, CREDIT, and handles non-existent account', async () => {
    const mockDebitDb = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ normal_balance: 'DEBIT', total_debits: 1000, total_credits: 300 }],
      }),
    };
    const debitBal = await ledgerService.getAccountBalance('promotional_expense', mockDebitDb);
    expect(debitBal).toBe(700);

    const mockCreditDb = {
      query: jest.fn().mockResolvedValueOnce({
        rows: [{ normal_balance: 'CREDIT', total_debits: 200, total_credits: 800 }],
      }),
    };
    const creditBal = await ledgerService.getAccountBalance('platform_revenue', mockCreditDb);
    expect(creditBal).toBe(600);

    const mockNotFoundDb = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }),
    };
    await expect(
      ledgerService.getAccountBalance('unknown_account', mockNotFoundDb)
    ).rejects.toThrow('Account code "unknown_account" not found');
  });
});
