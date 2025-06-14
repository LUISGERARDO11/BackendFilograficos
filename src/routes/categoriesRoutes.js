const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const uploadCategoryImage = require('../config/uploadCategoryImage'); // Nuevo middleware para imágenes de categorías

// Importar controladores
const categoryController = require('../controllers/categoryController');

// Rutas CRUD para Categorías
// Crea una nueva categoría
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadCategoryImage, // Añadir middleware para procesar la imagen
  categoryController.createCategory
);

// Obtiene todas las categorías
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  categoryController.getAllCategories
);

// Obtiene todas las categorías
router.get(
  '/get-categories',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  categoryController.getCategories
);

// Obtiene todas las categorías públicas
router.get(
  '/public-categories',
  categoryController.getCategories
);

// Obtiene categorías autenticadas
router.get(
  '/auth-categories',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  categoryController.getCategories
);

// Elimina una categoría de la base de datos
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  categoryController.deleteCategory
);

// Obtiene una categoría por su ID
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  categoryController.getCategoryById
);

// Actualiza una categoría por ID
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  uploadCategoryImage, // Añadir middleware para procesar la imagen
  categoryController.updateCategory
);

module.exports = router;