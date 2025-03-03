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

// Ruta para obtener todos los productos activos del catálogo (requiere autenticación y rol de administrador)
router.get(
  '/catalog',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productCatalogController.getAllProducts
);

// Ruta para eliminar lógicamente un producto (solo administradores)
router.delete(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productCatalogController.deleteProduct
);

// Ruta para obtener los detalles de un producto por ID (requiere autenticación y rol de administrador)
router.get(
  '/detail/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productCatalogController.getProductById
);

// Ruta para actualizar un producto (solo administradores)
router.put(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateProductImages(uploadProductImages),
  productCatalogController.updateProduct
);

module.exports = router;