const { Router } = require('express');
const { requireAuth } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { PERMISSIONS } = require('../security/policy');
const {
  listNotifications,
  markAsRead,
  markAllAsRead,
} = require('../controllers/notification.controller');

const router = Router();

router.use(requireAuth);

router.get('/', authorize(PERMISSIONS.USERS_READ_OWN), listNotifications);
router.patch('/:id/read', authorize(PERMISSIONS.USERS_WRITE_OWN), markAsRead);
router.post('/read-all', authorize(PERMISSIONS.USERS_WRITE_OWN), markAllAsRead);

module.exports = router;
