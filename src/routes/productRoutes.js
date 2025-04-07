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
const {
    validateProduct, validateDeleteProduct, validateGetProductById, validateUpdateProduct, validateDeleteVariants, validateGetAllProducts,
    validateGetAllVariants, validateGetVariantById, validateUpdateVariantPrice, validateGetPriceHistory,
    validateBatchUpdateVariantPrices, validateBatchUpdateVariantPricesIndividual,
} = require('../middlewares/validateProductCatalog');

// Ruta para crear un producto (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadProductImages,
  validateProductImages,
  validateProduct,
  productCatalogController.createProduct
);

// Ruta para obtener todos los productos activos del catálogo (requiere autenticación y rol de administrador)
router.get(
  '/catalog',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetAllProducts,
  productCatalogController.getAllProducts
);

// Ruta para eliminar lógicamente un producto (solo administradores)
router.delete(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateDeleteProduct,
  productCatalogController.deleteProduct
);

// Ruta para obtener los detalles de un producto por ID (requiere autenticación y rol de administrador)
router.get(
  '/detail/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetProductById,
  productCatalogController.getProductById
);

// Ruta para actualizar un producto (solo administradores)
router.patch(
  '/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadProductImages,
  validateProductImages,
  validateUpdateProduct,
  productCatalogController.updateProduct
);

// Ruta para eliminar lógicamente múltiples variantes específicas (solo administradores)
router.delete(
  '/:product_id/variants',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateDeleteVariants,
  productCatalogController.deleteVariant
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

// Rutas de precios (estáticas primero)
router.get(
  '/price',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetAllVariants,
  productPriceController.getAllVariants
);

// Nueva ruta para actualización en lote de precios (uniforme)
router.put(
  '/price/batch-update',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateBatchUpdateVariantPrices,
  productPriceController.batchUpdateVariantPrices
);

// Nueva ruta para actualización en lote de precios individual
router.put(
  '/price/batch-update-individual',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateBatchUpdateVariantPricesIndividual,
  productPriceController.batchUpdateVariantPricesIndividual
);

// Rutas dinámicas de precios (después de las estáticas)
router.get(
  '/price/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetVariantById,
  productPriceController.getVariantById
);

router.put(
  '/price/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateUpdateVariantPrice,
  productPriceController.updateVariantPrice
);

router.get(
  '/price/history/:variant_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateGetPriceHistory,
  productPriceController.getPriceHistoryByVariantId
);

// Rutas públicas y autenticadas (HAILIE)
router.get(
  '/public-catalog',
  publicProductCatalogController.getAllProducts
);

router.get(
  '/auth-catalog',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  authProductCatalogController.getAllProducts
);

router.get(
  '/public-catalog/:product_id',
  publicProductCatalogController.getProductById
);

router.get(
  '/auth-catalog/:product_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  authProductCatalogController.getProductById
);

module.exports = router;