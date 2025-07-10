const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Crear una orden
router.post('/create',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  orderController.createOrder
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
//devolver las opciones activas
router.get('/shipping-options',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //orderController.getShippingOptions
);
//devolver las opciones activas
router.get('/delivery',
  //authMiddleware,
  //okenExpirationMiddleware.verifyTokenExpiration,
  //orderController.getDeliveryPoints
);
module.exports = router;