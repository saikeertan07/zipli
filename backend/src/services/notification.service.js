const { query } = require('../config/db');
const { sseHub } = require('./sse.service');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

/**
 * Default pluggable email provider logging to stdout/logger.
 */
class ConsoleEmailProvider {
  async sendEmail({ to, subject, body }) {
    logger.info(`[Email Dispatcher] To: ${to} | Subject: "${subject}" | Body: "${body}"`);
    return { provider: 'console', delivered: true, messageId: `email_${Date.now()}` };
  }
}

/**
 * Web Push ready abstraction for browser notifications.
 */
class WebPushProvider {
  async sendPush({ subscription, payload }) {
    logger.info('[WebPush Dispatcher] Push notification queued', { subscription, payload });
    return { provider: 'web-push', delivered: true };
  }
}

/**
 * In-App Notification provider persisting to database and streaming via SSE.
 */
class InAppNotificationProvider {
  async sendInApp({ userId, type, title, body, data = {} }) {
    const res = await query(
      `INSERT INTO notifications (user_id, type, title, body, data, read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING id, user_id, type, title, body, data, read, created_at`,
      [userId, type, title, body, JSON.stringify(data)]
    );

    const record = res.rows[0];

    // Stream in real-time to user's active SSE connections
    sseHub.emit({
      targetUserId: userId,
      eventName: 'notification',
      data: record,
    });

    return record;
  }
}

class NotificationService {
  constructor() {
    this.emailProvider = new ConsoleEmailProvider();
    this.pushProvider = new WebPushProvider();
    this.inAppProvider = new InAppNotificationProvider();
  }

  setEmailProvider(provider) {
    this.emailProvider = provider;
  }

  setPushProvider(provider) {
    this.pushProvider = provider;
  }

  /**
   * Dispatches a multi-channel notification.
   *
   * @param {Object} options
   * @param {number} options.userId - Recipient user ID
   * @param {string} options.type - Notification type ('ORDER_PLACED', 'ORDER_STATUS_CHANGED', 'PROMOTION', etc.)
   * @param {string} options.title - Notification title
   * @param {string} options.body - Notification body
   * @param {Object} [options.data={}] - Metadata payload
   * @param {string[]} [options.channels=['in_app', 'email']] - Channels to dispatch
   */
  async sendNotification({
    userId,
    type,
    title,
    body,
    data = {},
    channels = ['in_app', 'email'],
    emailRecipient = null,
    pushSubscription = null,
  }) {
    const results = {};

    if (channels.includes('in_app') && userId) {
      try {
        results.inApp = await this.inAppProvider.sendInApp({ userId, type, title, body, data });
      } catch (err) {
        logger.error('Failed to dispatch in-app notification', { error: err.message, userId });
      }
    }

    if (channels.includes('email')) {
      try {
        let recipient = emailRecipient;
        if (!recipient && userId) {
          const userRes = await query('SELECT email FROM users WHERE id = $1', [userId]);
          if (userRes.rows.length) {
            recipient = userRes.rows[0].email;
          }
        }
        if (recipient) {
          results.email = await this.emailProvider.sendEmail({
            to: recipient,
            subject: title,
            body,
          });
        }
      } catch (err) {
        logger.error('Failed to dispatch email notification', { error: err.message, userId });
      }
    }

    if (channels.includes('push') && pushSubscription) {
      try {
        results.push = await this.pushProvider.sendPush({
          subscription: pushSubscription,
          payload: { title, body, data },
        });
      } catch (err) {
        logger.error('Failed to dispatch web push notification', { error: err.message, userId });
      }
    }

    return results;
  }

  /**
   * Retrieves user notifications with pagination and unread counts.
   */
  async getUserNotifications(userId, { limit = 20, unreadOnly = false } = {}) {
    let sql = `SELECT id, user_id, type, title, body, data, read, created_at
               FROM notifications
               WHERE user_id = $1`;
    const params = [userId];

    if (unreadOnly) {
      sql += ` AND read = false`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $2`;
    params.push(Math.min(100, Math.max(1, limit)));

    const listRes = await query(sql, params);

    const countRes = await query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE user_id = $1 AND read = false`,
      [userId]
    );

    return {
      unreadCount: Number(countRes.rows[0].unread_count || 0),
      notifications: listRes.rows,
    };
  }

  /**
   * Marks single notification as read.
   */
  async markAsRead(userId, notificationId) {
    const res = await query(
      `UPDATE notifications
       SET read = true
       WHERE id = $1 AND user_id = $2
       RETURNING id, read`,
      [notificationId, userId]
    );

    if (res.rowCount === 0) {
      throw new AppError('Notification not found', 404);
    }
    return res.rows[0];
  }

  /**
   * Marks all notifications as read for a user.
   */
  async markAllAsRead(userId) {
    const res = await query(
      `UPDATE notifications
       SET read = true
       WHERE user_id = $1 AND read = false
       RETURNING id`,
      [userId]
    );
    return { markedCount: res.rowCount };
  }
}

const notificationService = new NotificationService();

module.exports = {
  NotificationService,
  notificationService,
  ConsoleEmailProvider,
  WebPushProvider,
  InAppNotificationProvider,
};
