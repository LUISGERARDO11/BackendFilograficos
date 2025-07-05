const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const orderController = require('../controllers/orderController');

// Obtener todas las órdenes para administradores
router.get(
  '/',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //roleMiddleware(['administrador']),
  orderController.getOrdersForAdmin
);

router.get(
  '/summary',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //roleMiddleware(['administrador']),
  orderController.getOrderSummary
);

router.get(
  '/by-date',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //roleMiddleware(['administrador']),
  orderController.getOrdersByDateForAdmin
);

// Obtener detalles de una orden por ID para administradores
router.get(
  '/:id',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //roleMiddleware(['administrador']),
  orderController.getOrderDetailsByIdForAdmin
);

// Actualizar el estado de una orden
router.put(
  '/:id/status',
  //authMiddleware,
  //tokenExpirationMiddleware.verifyTokenExpiration,
  //roleMiddleware(['administrador']),
  orderController.updateOrderStatus
);

module.exports = router;