const express = require('express');
const router = express.Router();

// Importar controladores
const productCatalogController = require('../controllers/productCatalogController');
const productStockController = require('../controllers/productStockController');
const productPriceController = require('../controllers/productPriceController');
const publicProductCatalogController = require('../controllers/publicProductCatalogController');//(HAILIE)
const authProductCatalogController = require('../controllers/authProductCatalogController');//(HAILIE)

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const validateProductImages = require('../middlewares/validateProductImages');
const uploadProductImages = require('../config/multerProductImagesConfig');
const { validateProduct, validateGetProducts, validateDeleteProduct, validateGetProductById, validateUpdateProduct } = require('../middlewares/productValidation');

// Ruta para crear un producto (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadProductImages, // Configuración de Multer para múltiples imágenes por variante
  validateProductImages, // Validación de imágenes (1-10 por variante)
  validateProduct, // Validación de datos del producto y variantes
  productCatalogController.createProduct
);

// Ruta para obtener todos los productos activos del catálogo (requiere autenticación y rol de administrador)
router.get(
  '/catalog',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetProducts, // Validación de parámetros de consulta
  productCatalogController.getAllProducts
);

// Ruta para eliminar lógicamente un producto (solo administradores)
router.delete(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateDeleteProduct, // Validación del parámetro product_id
  productCatalogController.deleteProduct
);

// Ruta para obtener los detalles de un producto por ID (requiere autenticación y rol de administrador)
router.get(
  '/detail/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetProductById, // Validación del parámetro product_id
  productCatalogController.getProductById
);

// Ruta para actualizar un producto (solo administradores)
router.put(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadProductImages, // Configuración de Multer para múltiples imágenes por variante
  validateProductImages, // Validación de imágenes (1-10 por variante)
  validateUpdateProduct, // Validación de datos del producto y variantes
  productCatalogController.updateProduct
);

// Ruta para obtener variantes con información de stock (requiere autenticación y rol de administrador)
router.get(
  '/stock/variants',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productStockController.getStockVariants
);

// Ruta para actualizar el stock de una variante (requiere autenticación y rol de administrador)
router.put(
  '/stock/update',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productStockController.updateStock
);

// Ruta para obtener todas las variantes con filtros y ordenamiento (requiere autenticación y rol de administrador)
router.get(
  '/price',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.getAllVariants
);

// Ruta para obtener una variante por ID (requiere autenticación y rol de administrador)
router.get(
  '/price/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.getVariantById
);

// Ruta para actualizar el precio de una variante (requiere autenticación y rol de administrador)
router.put(
  '/price/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.updateVariantPrice
);

// Ruta para obtener el historial de precios de una variante (requiere autenticación y rol de administrador)
router.get(
  '/price/history/:variant_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.getPriceHistoryByVariantId
);

// Nueva ruta para actualización en lote de precios (uniforme)
router.put(
  '/price/batch-update',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.batchUpdateVariantPrices
);

// Nueva ruta para actualización en lote de precios individual
router.put(
  '/price/batch-update-individual',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productPriceController.batchUpdateVariantPricesIndividual
);

//(HAILIE)
// Rutas para visitantes (públicas):
router.get(
  '/public-catalog',
  publicProductCatalogController.getAllProducts
);
router.get(
  '/auth-catalog',
  authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,
  authProductCatalogController.getAllProducts
);

router.get(
  '/public-catalog/:product_id',
  publicProductCatalogController.getProductById
);
router.get(
  '/auth-catalog/:product_id',
  authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,
  authProductCatalogController.getProductById
);
module.exports = router;