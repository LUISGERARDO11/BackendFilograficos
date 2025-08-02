const express = require('express');
const router = express.Router();

// Importar controladores
const promotionController = require('../controllers/promotionController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Crear una nueva promoción
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.createPromotion
);

// Obtener todas las promociones activas
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.getAllPromotions
);

// Obtener todas las variantes
router.get(
  '/variants',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.getAllVariants
);

// Aplicar una promoción al carrito
router.post(
  '/apply',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  promotionController.applyPromotion
);

// Obtener promociones disponibles para el usuario
router.get(
  '/available',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  promotionController.getAvailablePromotions
);

// Obtener una promoción por ID
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.getPromotionById
);

// Actualizar una promoción
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.updatePromotion
);

// Eliminar una promoción (eliminación lógica)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.deletePromotion
);

module.exports = router;