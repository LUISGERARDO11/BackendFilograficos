const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/subscribe', authMiddleware, notificationController.subscribeToPush);
router.delete('/unsubscribe', authMiddleware, notificationController.unsubscribeFromPush);

// Nuevos endpoints
router.get('/history', authMiddleware, notificationController.getNotificationHistory);
router.post('/mark-seen', authMiddleware, notificationController.markNotificationAsSeen);

module.exports = router;