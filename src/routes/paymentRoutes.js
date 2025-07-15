// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');

router.post('/webhook', paymentController.handleMercadoPagoWebhook);

module.exports = router;