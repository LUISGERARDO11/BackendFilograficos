const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const couponController = require('../controllers/CouponController');
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Crear una orden (soporta órdenes desde carrito o item único)
router.post('/create',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  orderController.createOrder
);

// Aplicar un cupón
router.post('/coupons/apply',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  couponController.applyCoupon
);

// Obtener opciones de envío disponibles
router.get('/shippingOptions',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  orderController.getShippingOptions
);

// Obtener detalles de una orden por ID
router.get('/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  orderController.getOrderById
);

// Obtener todas las órdenes del usuario con búsqueda y filtro
router.get('/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  orderController.getOrders
);

// Webhook de Mercado Pago (sin autenticación ni CSRF)
router.post('/webhook/mercado-pago', orderController.handleMercadoPagoWebhook);

module.exports = router;