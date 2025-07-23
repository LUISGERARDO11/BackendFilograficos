const express = require('express');
const router = express.Router();

// Import controllers
const recommendationController = require('../controllers/recommendationController');

// Route for getting recommendations based on a product or cart (POST /recommendations)
router.post(
  '/',
  recommendationController.getRecommendations
);

// Route for checking the service status (GET /health)
router.get(
  '/health',
  recommendationController.healthCheck
);

module.exports = router;