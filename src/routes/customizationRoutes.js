const express = require('express');
const router = express.Router();
const customizationController = require('../controllers/customizationController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Obtener opciones de personalización para un producto
router.get('/options/:productId', authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration, customizationController.getCustomizationOptions);

// Crear una personalización
router.post('/', authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration, customizationController.createCustomization);

module.exports = router;