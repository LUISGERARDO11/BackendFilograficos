/* This JavaScript code is setting up routes for handling CRUD operations related to FAQ categories
using Express.js. Here's a breakdown of what each part does: */
const express = require('express');
const router = express.Router();

// Importar controladores
const faqCategoryController = require('../controllers/faqCategoryController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para crear una nueva categoría de FAQ
router.post(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    faqCategoryController.createFaqCategory
);

// Nueva ruta pública para obtener ID, nombre y ruta de categorías activas
router.get(
    '/public',
    faqCategoryController.getFaqCategories
);

// Ruta para obtener una categoría de FAQ por ID
router.get(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    faqCategoryController.getFaqCategoryById
);

// Ruta para obtener todas las categorías de FAQ activas
router.get(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    faqCategoryController.getAllFaqCategories
);

// Ruta para actualizar una categoría de FAQ
router.put(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    faqCategoryController.updateFaqCategory
);

// Ruta para eliminar (lógicamente) una categoría de FAQ
router.delete(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    faqCategoryController.deleteFaqCategory
);

module.exports = router;
