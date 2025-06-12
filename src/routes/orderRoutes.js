const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

router.post('/create', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, orderController.createOrder);

module.exports = router;