const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authMiddleware = require('../middlewares/authMiddleware');

router.post('/subscribe', authMiddleware, notificationController.subscribeToPush);
router.delete('/unsubscribe', authMiddleware, notificationController.unsubscribeFromPush);

module.exports = router;