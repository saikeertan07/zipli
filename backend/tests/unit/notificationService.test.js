const {
  NotificationService,
  ConsoleEmailProvider,
  WebPushProvider,
  InAppNotificationProvider,
} = require('../../src/services/notification.service');
const { pool } = require('../../src/config/db');
const { truncateUserData } = require('../setup');

describe('NotificationService & Multi-Channel Providers', () => {
  let userId;
  let service;

  beforeEach(async () => {
    await truncateUserData();
    const uRes = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ('Notif User', 'notif@example.com', 'hash')
       RETURNING id`
    );
    userId = uRes.rows[0].id;
    service = new NotificationService();
  });

  describe('ConsoleEmailProvider & WebPushProvider', () => {
    it('sends email via console provider', async () => {
      const emailProv = new ConsoleEmailProvider();
      const res = await emailProv.sendEmail({
        to: 'test@example.com',
        subject: 'Welcome',
        body: 'Welcome to Zipli!',
      });
      expect(res.delivered).toBe(true);
      expect(res.provider).toBe('console');
    });

    it('sends push notification via web-push provider', async () => {
      const pushProv = new WebPushProvider();
      const res = await pushProv.sendPush({
        subscription: { endpoint: 'https://push.example.com' },
        payload: { title: 'Order Dispatched' },
      });
      expect(res.delivered).toBe(true);
    });
  });

  describe('Multi-Channel Dispatch', () => {
    it('dispatches to in-app, email, and push channels', async () => {
      const mockEmail = { sendEmail: jest.fn().mockResolvedValue({ delivered: true }) };
      const mockPush = { sendPush: jest.fn().mockResolvedValue({ delivered: true }) };

      service.setEmailProvider(mockEmail);
      service.setPushProvider(mockPush);

      const results = await service.sendNotification({
        userId,
        type: 'ORDER_PLACED',
        title: 'Order Confirmed',
        body: 'Your order is confirmed.',
        channels: ['in_app', 'email', 'push'],
        pushSubscription: { endpoint: 'sub' },
      });

      expect(results.inApp).toBeDefined();
      expect(results.inApp.title).toBe('Order Confirmed');
      expect(mockEmail.sendEmail).toHaveBeenCalled();
      expect(mockPush.sendPush).toHaveBeenCalled();

      // Verify stored in database
      const notifs = await service.getUserNotifications(userId);
      expect(notifs.unreadCount).toBe(1);
      expect(notifs.notifications).toHaveLength(1);
    });

    it('marks notification as read and marks all as read', async () => {
      await service.sendNotification({
        userId,
        type: 'ALERT',
        title: 'Alert 1',
        body: 'Body 1',
        channels: ['in_app'],
      });
      await service.sendNotification({
        userId,
        type: 'ALERT',
        title: 'Alert 2',
        body: 'Body 2',
        channels: ['in_app'],
      });

      const before = await service.getUserNotifications(userId);
      expect(before.unreadCount).toBe(2);

      // Mark single
      const firstId = before.notifications[0].id;
      const updated = await service.markAsRead(userId, firstId);
      expect(updated.read).toBe(true);

      const mid = await service.getUserNotifications(userId, { unreadOnly: true });
      expect(mid.notifications).toHaveLength(1);

      // Mark all
      const allRes = await service.markAllAsRead(userId);
      expect(allRes.markedCount).toBe(1);

      const after = await service.getUserNotifications(userId);
      expect(after.unreadCount).toBe(0);
    });

    it('throws 404 when marking non-existent notification', async () => {
      await expect(service.markAsRead(userId, 999999)).rejects.toThrow(/Notification not found/);
    });

    it('sends email to direct emailRecipient and handles provider errors gracefully', async () => {
      const mockEmail = { sendEmail: jest.fn().mockResolvedValue({ delivered: true }) };
      service.setEmailProvider(mockEmail);

      const res = await service.sendNotification({
        type: 'DIRECT',
        title: 'Direct Email',
        body: 'Direct msg',
        channels: ['email'],
        emailRecipient: 'direct@example.com',
      });
      expect(res.email).toBeDefined();
      expect(mockEmail.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'direct@example.com' })
      );

      // Provider failure handling branches
      const failingEmail = { sendEmail: jest.fn().mockRejectedValue(new Error('SMTP down')) };
      service.setEmailProvider(failingEmail);
      const failRes = await service.sendNotification({
        userId,
        title: 'Failing',
        body: 'Fails',
        channels: ['email'],
      });
      expect(failRes.email).toBeUndefined();

      const failingPush = { sendPush: jest.fn().mockRejectedValue(new Error('Push gateway down')) };
      service.setPushProvider(failingPush);
      const pushRes = await service.sendNotification({
        userId,
        title: 'Failing push',
        body: 'Fails',
        channels: ['push'],
        pushSubscription: { endpoint: 'invalid' },
      });
      expect(pushRes.push).toBeUndefined();
    });
  });
});
