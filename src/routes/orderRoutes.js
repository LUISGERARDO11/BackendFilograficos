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

// Obtener todas las órdenes del usuario
router.get('/', 
  authMiddleware, 
  tokenExpirationMiddleware.verifyTokenExpiration, 
  orderController.getOrders
);

module.exports = router;