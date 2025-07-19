const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadReviewMedia = require('../config/multerUploadReviewMedia');

// Importar controladores
const reviewController = require('../controllers/reviewController');

// ====================== Rutas públicas específicas ======================

// Resumen de calificaciones de un producto
router.get('/product/:productId/summary', reviewController.getReviewsSummaryByProduct);

// Obtener todas las reseñas de un producto
router.get('/product/:productId', reviewController.getReviewsByProduct);

// ====================== Rutas de administrador ======================

// Obtener todas las reseñas con filtros
router.get(
  '/admin',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  reviewController.getReviewsForAdmin
);

// Eliminar reseña por administrador
router.delete(
  '/admin/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  reviewController.deleteReviewByAdmin
);

// ====================== Rutas de usuario autenticado ======================

// Obtener reseñas del usuario autenticado
router.get(
  '/my-reviews',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.getUserReviews
);

// Obtener compras pendientes de reseña
router.get(
  '/pending',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.getPendingReviews
);

// Crear nueva reseña
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  uploadReviewMedia,
  reviewController.createReview
);

// ====================== Rutas dinámicas al final ======================

// Obtener reseña por ID
router.get('/:reviewId', reviewController.getReviewById);

// Actualizar reseña (solo propietario)
router.put(
  '/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  uploadReviewMedia,
  reviewController.updateReview
);

// Eliminar reseña (solo propietario)
router.delete(
  '/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.deleteReviewByOwner
);

module.exports = router;