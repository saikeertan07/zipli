/**
 * @file ledger.service.js
 * @description Double-Entry Balanced General Ledger Service
 * Requirement: F-051 / Prompt Pack Part 5 Section 4
 *
 * Implements:
 * 1. Double-entry balanced journal entries in integer paise.
 * 2. Standard quick-commerce chart of accounts.
 * 3. Immutable journal entries & lines (corrections via reversing entries only).
 * 4. Zero-sum trial balance reporting and balance integrity verification.
 */

const { pool, query } = require('../config/db');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

class LedgerService {
  /**
   * Records an order payment journal entry.
   *
   * Balance Equation:
   * Total Debits = orderTotalPaise (gateway/wallet/cash) + discountPaise (promotional_expense)
   * Total Credits = (itemsPaise - commissionPaise) [store_payable]
   *               + commissionPaise [platform_revenue]
   *               + deliveryFeePaise [delivery_fee_revenue]
   *               + tipPaise [rider_tip_payable]
   *               + gstPaise [tax_payable]
   *
   * @param {Object} params
   * @param {string|number} params.orderId
   * @param {number} params.orderTotalPaise - Net amount paid by shopper
   * @param {number} params.itemsPaise - Gross item sales value
   * @param {number} [params.commissionPaise=0] - Platform take-rate
   * @param {number} [params.deliveryFeePaise=0] - Delivery charge
   * @param {number} [params.tipPaise=0] - 100% rider tip
   * @param {number} [params.gstPaise=0] - Taxes collected
   * @param {number} [params.discountPaise=0] - Voucher / discount subsidized
   * @param {'GATEWAY'|'WALLET'|'COD'} [params.paymentMethod='GATEWAY']
   * @param {string} [params.description]
   * @param {import('pg').PoolClient} [dbClient]
   * @returns {Promise<Object>} Created journal entry with lines
   */
  async recordOrderPayment(params, dbClient = null) {
    const {
      orderId,
      orderTotalPaise,
      itemsPaise,
      commissionPaise = 0,
      deliveryFeePaise = 0,
      tipPaise = 0,
      gstPaise = 0,
      discountPaise = 0,
      paymentMethod = 'GATEWAY',
      description,
    } = params;

    if (!orderId) {
      throw new AppError('orderId is required to post order payment ledger entry', 400);
    }

    const orderTotal = Math.round(Number(orderTotalPaise) || 0);
    const items = Math.round(Number(itemsPaise) || 0);
    const commission = Math.round(Number(commissionPaise) || 0);
    const delivery = Math.round(Number(deliveryFeePaise) || 0);
    const tip = Math.round(Number(tipPaise) || 0);
    const gst = Math.round(Number(gstPaise) || 0);
    const discount = Math.round(Number(discountPaise) || 0);

    // Determine debit receivable account based on settlement method
    let clearingAccount = 'gateway_clearing';
    if (paymentMethod === 'WALLET') {
      clearingAccount = 'customer_wallet';
    } else if (paymentMethod === 'COD') {
      clearingAccount = 'cash_in_transit';
    }

    const storePayout = items - commission;
    if (storePayout < 0) {
      throw new AppError('Commission cannot exceed gross item sales value', 400);
    }

    // Verify mathematical equality before hitting database
    const totalDebits = orderTotal + discount;
    const totalCredits = storePayout + commission + delivery + tip + gst;

    if (totalDebits !== totalCredits) {
      throw new AppError(
        `Order payment unbalanced: debits (${totalDebits} paise) != credits (${totalCredits} paise). Diff: ${totalDebits - totalCredits}`,
        400
      );
    }

    const lines = [];

    // 1. Debits
    lines.push({
      account_code: clearingAccount,
      debit_paise: orderTotal,
      credit_paise: 0,
      memo: `Customer payment received via ${paymentMethod} for order #${orderId}`,
    });

    if (discount > 0) {
      lines.push({
        account_code: 'promotional_expense',
        debit_paise: discount,
        credit_paise: 0,
        memo: `Promotional voucher discount subsidy for order #${orderId}`,
      });
    }

    // 2. Credits
    if (storePayout > 0) {
      lines.push({
        account_code: 'store_payable',
        debit_paise: 0,
        credit_paise: storePayout,
        memo: `Merchant payable (items minus commission) for order #${orderId}`,
      });
    }

    if (commission > 0) {
      lines.push({
        account_code: 'platform_revenue',
        debit_paise: 0,
        credit_paise: commission,
        memo: `Platform take-rate commission for order #${orderId}`,
      });
    }

    if (delivery > 0) {
      lines.push({
        account_code: 'delivery_fee_revenue',
        debit_paise: 0,
        credit_paise: delivery,
        memo: `Delivery fee earned on order #${orderId}`,
      });
    }

    if (tip > 0) {
      lines.push({
        account_code: 'rider_tip_payable',
        debit_paise: 0,
        credit_paise: tip,
        memo: `100% rider tip pass-through for order #${orderId}`,
      });
    }

    if (gst > 0) {
      lines.push({
        account_code: 'tax_payable',
        debit_paise: 0,
        credit_paise: gst,
        memo: `GST tax liability collected on order #${orderId}`,
      });
    }

    return this.postJournalEntry(
      {
        referenceType: 'ORDER_PAYMENT',
        referenceId: String(orderId),
        description: description || `Payment captured for order #${orderId} (${paymentMethod})`,
        lines,
      },
      dbClient
    );
  }

  /**
   * Records an order refund journal entry (reversing entry).
   *
   * @param {Object} params
   * @param {string|number} params.orderId
   * @param {number} params.refundTotalPaise - Total refunded to shopper
   * @param {number} params.storeDeductionPaise - Amount clawed back from store payable
   * @param {number} [params.platformDeductionPaise=0] - Commission refunded
   * @param {number} [params.taxDeductionPaise=0] - Tax refunded
   * @param {'GATEWAY'|'WALLET'} [params.refundTarget='GATEWAY']
   * @param {string} [params.reason]
   * @param {import('pg').PoolClient} [dbClient]
   * @returns {Promise<Object>}
   */
  async recordOrderRefund(params, dbClient = null) {
    const {
      orderId,
      refundTotalPaise,
      storeDeductionPaise,
      platformDeductionPaise = 0,
      taxDeductionPaise = 0,
      refundTarget = 'GATEWAY',
      reason = 'Customer order refund',
    } = params;

    const refundTotal = Math.round(Number(refundTotalPaise) || 0);
    const storeDed = Math.round(Number(storeDeductionPaise) || 0);
    const platformDed = Math.round(Number(platformDeductionPaise) || 0);
    const taxDed = Math.round(Number(taxDeductionPaise) || 0);

    const totalDebits = storeDed + platformDed + taxDed;
    const totalCredits = refundTotal;

    if (totalDebits !== totalCredits) {
      throw new AppError(
        `Refund entry unbalanced: debits (${totalDebits}) != credits (${totalCredits})`,
        400
      );
    }

    const lines = [];

    // Debits (reverse payables / revenue / tax)
    if (storeDed > 0) {
      lines.push({
        account_code: 'store_payable',
        debit_paise: storeDed,
        credit_paise: 0,
        memo: `Clawback from store for order #${orderId} refund: ${reason}`,
      });
    }
    if (platformDed > 0) {
      lines.push({
        account_code: 'platform_revenue',
        debit_paise: platformDed,
        credit_paise: 0,
        memo: `Platform commission reversed for order #${orderId}`,
      });
    }
    if (taxDed > 0) {
      lines.push({
        account_code: 'tax_payable',
        debit_paise: taxDed,
        credit_paise: 0,
        memo: `Tax liability reversed for order #${orderId}`,
      });
    }

    // Credits (payout via gateway or wallet deposit)
    const targetAccount = refundTarget === 'WALLET' ? 'customer_wallet' : 'gateway_clearing';
    lines.push({
      account_code: targetAccount,
      debit_paise: 0,
      credit_paise: refundTotal,
      memo: `Refund credited to ${targetAccount} for order #${orderId}`,
    });

    return this.postJournalEntry(
      {
        referenceType: 'ORDER_REFUND',
        referenceId: String(orderId),
        description: `Refund processed for order #${orderId}: ${reason}`,
        lines,
      },
      dbClient
    );
  }

  /**
   * Posts an arbitrary balanced journal entry inside a database transaction.
   *
   * @param {Object} entry
   * @param {string} entry.referenceType
   * @param {string} entry.referenceId
   * @param {string} entry.description
   * @param {Array<Object>} entry.lines
   * @param {import('pg').PoolClient} [externalClient]
   * @returns {Promise<Object>}
   */
  async postJournalEntry(entry, externalClient = null) {
    const { referenceType, referenceId, description, lines } = entry;

    if (!lines || !Array.isArray(lines) || lines.length < 2) {
      throw new AppError('Journal entry must contain at least 2 balanced lines', 400);
    }

    let sumDebit = 0;
    let sumCredit = 0;
    for (const line of lines) {
      sumDebit += Math.round(Number(line.debit_paise) || 0);
      sumCredit += Math.round(Number(line.credit_paise) || 0);
    }

    if (sumDebit !== sumCredit) {
      throw new AppError(
        `Unbalanced journal entry: Total debits (${sumDebit}) != Total credits (${sumCredit})`,
        400
      );
    }

    const runner = async (client) => {
      // 1. Insert Entry Header
      const headerRes = await client.query(
        `INSERT INTO ledger_journal_entries (reference_type, reference_id, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [referenceType, referenceId, description]
      );
      const journalEntry = headerRes.rows[0];

      // 2. Insert Lines
      const createdLines = [];
      for (const line of lines) {
        const lineRes = await client.query(
          `INSERT INTO ledger_lines (entry_id, account_code, debit_paise, credit_paise, memo)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [
            journalEntry.id,
            line.account_code,
            Math.round(Number(line.debit_paise) || 0),
            Math.round(Number(line.credit_paise) || 0),
            line.memo || null,
          ]
        );
        createdLines.push(lineRes.rows[0]);
      }

      logger.info(
        `Ledger journal entry #${journalEntry.entry_number} posted (${referenceType}:${referenceId}) with ${createdLines.length} lines. Sum: ₹${(sumDebit / 100).toFixed(2)}`
      );

      return {
        ...journalEntry,
        lines: createdLines,
      };
    };

    if (externalClient) {
      return runner(externalClient);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await runner(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Computes trial balance across all accounts in the general ledger.
   * Total debits MUST strictly equal total credits.
   *
   * @param {import('pg').PoolClient} [dbClient]
   * @returns {Promise<Object>}
   */
  async getTrialBalance(dbClient = null) {
    const db = dbClient || { query };

    const res = await db.query(`
      SELECT
        a.code,
        a.name,
        a.type,
        a.normal_balance,
        COALESCE(SUM(l.debit_paise), 0)::BIGINT AS total_debit_paise,
        COALESCE(SUM(l.credit_paise), 0)::BIGINT AS total_credit_paise
      FROM ledger_accounts a
      LEFT JOIN ledger_lines l ON a.code = l.account_code
      GROUP BY a.code, a.name, a.type, a.normal_balance
      ORDER BY a.type, a.code
    `);

    let totalDebitsPaise = 0n;
    let totalCreditsPaise = 0n;

    const accounts = res.rows.map((row) => {
      const debit = BigInt(row.total_debit_paise);
      const credit = BigInt(row.total_credit_paise);
      totalDebitsPaise += debit;
      totalCreditsPaise += credit;

      let netBalance = 0n;
      if (row.normal_balance === 'DEBIT') {
        netBalance = debit - credit;
      } else {
        netBalance = credit - debit;
      }

      return {
        code: row.code,
        name: row.name,
        type: row.type,
        normalBalance: row.normal_balance,
        totalDebitPaise: Number(debit),
        totalCreditPaise: Number(credit),
        netBalancePaise: Number(netBalance),
      };
    });

    const isBalanced = totalDebitsPaise === totalCreditsPaise;
    const differencePaise = Number(totalDebitsPaise - totalCreditsPaise);

    return {
      totalDebitsPaise: Number(totalDebitsPaise),
      totalCreditsPaise: Number(totalCreditsPaise),
      differencePaise,
      isBalanced,
      accounts,
      verifiedAt: new Date().toISOString(),
    };
  }

  /**
   * Fetches net balance for a specific account code.
   *
   * @param {string} accountCode
   * @param {import('pg').PoolClient} [dbClient]
   * @returns {Promise<number>} Net balance in integer paise
   */
  async getAccountBalance(accountCode, dbClient = null) {
    const db = dbClient || { query };

    const res = await db.query(
      `
      SELECT
        a.normal_balance,
        COALESCE(SUM(l.debit_paise), 0)::BIGINT AS total_debits,
        COALESCE(SUM(l.credit_paise), 0)::BIGINT AS total_credits
      FROM ledger_accounts a
      LEFT JOIN ledger_lines l ON a.code = l.account_code
      WHERE a.code = $1
      GROUP BY a.normal_balance
    `,
      [accountCode]
    );

    if (res.rows.length === 0) {
      throw new AppError(`Account code "${accountCode}" not found`, 404);
    }

    const { normal_balance, total_debits, total_credits } = res.rows[0];
    const debits = BigInt(total_debits);
    const credits = BigInt(total_credits);

    if (normal_balance === 'DEBIT') {
      return Number(debits - credits);
    }
    return Number(credits - debits);
  }
}

const ledgerService = new LedgerService();

module.exports = {
  LedgerService,
  ledgerService,
};
