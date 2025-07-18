const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadReviewMedia = require('../config/multerUploadReviewMedia');

// Importar controladores
const reviewController = require('../controllers/reviewController');

// ====================== Rutas específicas primero ======================

// Ruta para obtener todas las reseñas de un producto (pública)
router.get('/product/:productId', reviewController.getReviewsByProduct);

// Ruta para obtener todas las reseñas con filtros (autenticado, administrador)
router.get(
  '/admin',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  reviewController.getReviewsForAdmin
);

// Ruta para eliminar una reseña (autenticado, administrador)
router.delete(
  '/admin/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  reviewController.deleteReviewByAdmin
);

// Nueva ruta: Obtener reseñas realizadas por el usuario autenticado
router.get(
  '/my-reviews',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.getUserReviews
);

// Nueva ruta: Obtener compras elegibles para reseñas (pendientes)
router.get(
  '/pending',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.getPendingReviews
);

// ====================== Rutas generales después ======================

// Ruta para crear una nueva reseña (autenticado, usuario)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  uploadReviewMedia,
  reviewController.createReview
);

// Ruta para obtener una reseña específica por ID (pública)
router.get('/:reviewId', reviewController.getReviewById);

// Ruta para actualizar una reseña existente (autenticado, propietario)
router.put(
  '/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  uploadReviewMedia,
  reviewController.updateReview
);

// Ruta para eliminar una reseña (autenticado, propietario)
router.delete(
  '/:reviewId',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  reviewController.deleteReviewByOwner
);

module.exports = router;