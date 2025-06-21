const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Importar controlador
const orderController = require('../controllers/orderController');

// Obtener todas las órdenes para administradores
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  orderController.getOrdersForAdmin
);

// Obtener detalles de una orden por ID para administradores
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  orderController.getOrderDetailsByIdForAdmin
);

// Actualizar el estado de una orden
router.patch(
  '/:id/status',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  orderController.updateOrderStatus
);

module.exports = router;