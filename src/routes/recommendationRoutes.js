const express = require('express');
const router = express.Router();

// Importar controladores
const recommendationController = require('../controllers/recommendationController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Ruta para obtener recomendaciones basadas en historial de usuario (GET /recommendations)
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  recommendationController.getRecommendations
);

// Ruta para obtener recomendaciones basadas en productos comprados (POST /recommendations/with-products)
router.post(
  '/with-products',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  recommendationController.getRecommendationsWithProducts
);

// Ruta para obtener resumen de clústeres (GET /recommendations/clusters)
router.get(
  '/clusters',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  recommendationController.getClusters
);

module.exports = router;