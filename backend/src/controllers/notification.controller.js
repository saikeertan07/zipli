const { notificationService } = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/notifications
const listNotifications = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit, 10) : 20;
  const unreadOnly = req.query.unreadOnly === 'true';

  const data = await notificationService.getUserNotifications(req.user.id, {
    limit,
    unreadOnly,
  });

  res.json({
    status: 'success',
    data,
  });
});

// PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const notification = await notificationService.markAsRead(req.user.id, req.params.id);

  res.json({
    status: 'success',
    data: { notification },
  });
});

// POST /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);

  res.json({
    status: 'success',
    message: 'All notifications marked as read',
    data: result,
  });
});

module.exports = {
  listNotifications,
  markAsRead,
  markAllAsRead,
};
