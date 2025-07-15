const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

router.post('/webhook',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    paymentController.handleMercadoPagoWebhook
);

module.exports = router;