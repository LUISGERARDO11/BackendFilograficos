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

// Obtener todas las variantes (movida antes de la ruta dinámica /:id)
router.get(
  '/variants',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  promotionController.getAllVariants
);

// Obtener una promoción por ID (movida después de /variants)
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