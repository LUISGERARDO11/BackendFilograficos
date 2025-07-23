const express = require('express');
const router = express.Router();

// Importar controladores
const recommendationController = require('../controllers/recommendationController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para obtener recomendaciones basadas en un producto (POST /recommendations)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  recommendationController.getRecommendations
);

// Ruta para verificar el estado del servicio (GET /health)
router.get(
  '/health',
  recommendationController.healthCheck
);

module.exports = router;