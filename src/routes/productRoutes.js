// routes/productRoutes.js
const express = require('express');
const router = express.Router();

// Importar controladores
const productCatalogController = require('../controllers/productCatalogController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const validateProductImages = require('../middlewares/validateProductImages');
const uploadProductImages = require('../config/multerProductImagesConfig');

// Ruta para crear un producto (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateProductImages(uploadProductImages), // Usa la configuración específica de multer para productos
  productCatalogController.createProduct
);

// Ruta para obtener todos los productos activos del catálogo (público, sin seguridad)
router.get(
  '/catalog',
  productCatalogController.getAllProducts
);

module.exports = router;