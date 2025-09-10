const express = require('express');
const router = express.Router();

// Importar controladores
const badgeCategoryController = require('../controllers/badgeCategoryController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Obtener todas las categorías de insignias
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.getAllBadgeCategories
);

// Obtener una categoría de insignias por ID
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.getBadgeCategoryById
);

// Crear una nueva categoría de insignias
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.createBadgeCategory
);

// Actualizar una categoría de insignias
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.updateBadgeCategory
);

// Eliminar una categoría de insignias (eliminación lógica)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.deleteBadgeCategory
);

module.exports = router;