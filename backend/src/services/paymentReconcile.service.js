/**
 * @file paymentReconcile.service.js
 * @description Automated reconciliation service for stuck payment orders (P0).
 * Polls provider for orders pending > N minutes. If captured, confirms order and balances ledger;
 * if failed or abandoned, automatically cancels order, restocks inventory, and releases reservation holds.
 */

const { pool } = require('../config/db');
const logger = require('../utils/logger');
const { getPaymentProvider } = require('./paymentProvider');
const { stockReservationService } = require('./stockReservation.service');
const { ledgerService } = require('./ledger.service');
const { outboxRelayService } = require('./outboxRelay.service');
const { transition } = require('../algo/stateMachine');

/**
 * Reconciles stuck payment orders.
 *
 * @param {Object} [options]
 * @param {number} [options.stuckThresholdMinutes=15] - Orders older than this will be checked
 * @returns {Promise<{ checked: number, confirmed: number, cancelled: number }>}
 */
async function reconcileStuckPayments({ stuckThresholdMinutes = 15 } = {}) {
  const client = await pool.connect();
  let confirmed = 0;
  let cancelled = 0;
  let checked = 0;

  try {
    const provider = getPaymentProvider();

    // Query pending orders older than the stuck threshold
    const stuckRes = await client.query(
      `SELECT o.id as order_id, o.user_id, o.grand_total_paise, o.grand_total,
              o.delivery_fee_paise, o.delivery_fee, o.taxes_paise, o.taxes,
              o.discount_paise, o.discount_amount, o.status as order_status,
              p.id as payment_order_id, p.provider, p.provider_order_id, p.amount_paise, p.status as payment_status
       FROM orders o
       JOIN payment_orders p ON o.id = p.order_id
       WHERE o.status = 'placed'
         AND p.status = 'CREATED'
         AND o.created_at < NOW() - ($1 || ' minutes')::interval
       ORDER BY o.created_at ASC
       LIMIT 50`,
      [stuckThresholdMinutes]
    );

    checked = stuckRes.rows.length;
    if (checked === 0) {
      return { checked: 0, confirmed: 0, cancelled: 0 };
    }

    logger.info('Starting payment reconciliation run', {
      stuckCount: checked,
      stuckThresholdMinutes,
    });

    for (const row of stuckRes.rows) {
      try {
        await client.query('BEGIN');

        // Lock order row
        const orderLock = await client.query(
          `SELECT id, status FROM orders WHERE id = $1 FOR UPDATE`,
          [row.order_id]
        );

        if (orderLock.rows.length === 0 || orderLock.rows[0].status !== 'placed') {
          await client.query('ROLLBACK');
          continue;
        }

        let isPaidAtProvider = false;
        try {
          const providerPayment = await provider.fetchPayment(row.provider_order_id);
          if (
            providerPayment &&
            (providerPayment.status === 'captured' || providerPayment.status === 'paid')
          ) {
            isPaidAtProvider = true;
          }
        } catch {
          // Provider reports not found or unpaid
          isPaidAtProvider = false;
        }

        const expectedPaise =
          Number(row.grand_total_paise) || Math.round(Number(row.grand_total) * 100);

        if (isPaidAtProvider) {
          // Provider captured payment: confirm order and balance ledger
          transition('placed', 'confirmed');
          await client.query(`UPDATE orders SET status = 'confirmed' WHERE id = $1`, [
            row.order_id,
          ]);
          await client.query(
            `UPDATE payment_orders SET status = 'PAID', updated_at = NOW() WHERE id = $1`,
            [row.payment_order_id]
          );

          await client.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status, note)
             VALUES ($1, 'placed', 'confirmed', 'Reconciled: payment verified at provider')`,
            [row.order_id]
          );

          // Ledger entry
          const deliveryFeePaise =
            Number(row.delivery_fee_paise) || Math.round(Number(row.delivery_fee || 0) * 100);
          const gstPaise = Number(row.taxes_paise) || Math.round(Number(row.taxes || 0) * 100);
          const discountPaise =
            Number(row.discount_paise) || Math.round(Number(row.discount_amount || 0) * 100);
          const itemsPaise = Math.max(
            0,
            expectedPaise + discountPaise - deliveryFeePaise - gstPaise
          );
          const commissionPaise = Math.round(itemsPaise * 0.15);

          await ledgerService.recordOrderPayment(
            {
              orderId: row.order_id,
              orderTotalPaise: expectedPaise,
              itemsPaise,
              commissionPaise,
              deliveryFeePaise,
              gstPaise,
              discountPaise,
              paymentMethod: 'RECONCILED_GATEWAY',
              description: `Reconciled payment captured for order #${row.order_id}`,
            },
            client
          );

          await outboxRelayService.recordEvent(client, {
            aggregateType: 'order',
            aggregateId: row.order_id,
            eventType: 'payment_confirmed',
            payload: { orderId: row.order_id, amountPaise: expectedPaise, reconciled: true },
          });

          confirmed++;
        } else {
          // Payment timed out or abandoned: cancel order, restock inventory, release holds
          await client.query(`UPDATE orders SET status = 'cancelled' WHERE id = $1`, [
            row.order_id,
          ]);
          await client.query(
            `UPDATE payment_orders SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1`,
            [row.payment_order_id]
          );

          // Restock items
          const itemsRes = await client.query(
            `SELECT product_id, quantity FROM order_items WHERE order_id = $1`,
            [row.order_id]
          );

          for (const item of itemsRes.rows) {
            if (item.product_id) {
              await client.query(`UPDATE products SET stock = stock + $1 WHERE id = $2`, [
                item.quantity,
                item.product_id,
              ]);
              await client.query(
                `INSERT INTO inventory_movements (product_id, delta, reason, ref_order_id)
                 VALUES ($1, $2, 'reconcile_timeout_restock', $3)`,
                [item.product_id, item.quantity, row.order_id]
              );
            }
          }

          // Release stock holds
          await stockReservationService.releaseUserReservation(row.user_id, client);

          await client.query(
            `INSERT INTO order_status_history (order_id, from_status, to_status, note)
             VALUES ($1, 'placed', 'cancelled', 'Auto-cancelled by reconciliation: payment timed out')`,
            [row.order_id]
          );

          await outboxRelayService.recordEvent(client, {
            aggregateType: 'order',
            aggregateId: row.order_id,
            eventType: 'payment_expired',
            payload: { orderId: row.order_id, reason: 'RECONCILIATION_TIMEOUT' },
          });

          cancelled++;
        }

        await client.query('COMMIT');
      } catch (orderErr) {
        await client.query('ROLLBACK').catch(() => {});
        logger.error('Failed to reconcile order', {
          orderId: row.order_id,
          error: orderErr.message,
        });
      }
    }

    logger.info('Payment reconciliation completed', { checked, confirmed, cancelled });
    return { checked, confirmed, cancelled };
  } finally {
    client.release();
  }
}

module.exports = {
  reconcileStuckPayments,
};
