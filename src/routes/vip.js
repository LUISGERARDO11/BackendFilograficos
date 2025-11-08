// routes/vip.js
const express = require('express');
const router = express.Router();
const vipController = require('../controllers/vipController');

router.post('/sync', vipController.syncVipLevels);

module.exports = router;