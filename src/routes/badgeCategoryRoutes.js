const express = require('express');
const router = express.Router();

// Importar controladores
const badgeCategoryController = require('../controllers/badgeCategoryController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// --- Rutas de Consulta ---

// Obtener todas las categorías de insignias (Consulta principal con filtros y paginación)
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

// --- Ruta de Reportes (¡NUEVA!) ---

// Generar Reporte de Distribución de Insignias por Categoría
router.get(
  '/report/distribution', // Se recomienda una ruta más específica
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  badgeCategoryController.getBadgeDistributionReport
);

// --- Rutas CRUD ---

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