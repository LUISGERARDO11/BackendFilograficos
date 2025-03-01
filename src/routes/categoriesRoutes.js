const express = require('express');
const router = express.Router();

//Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

//Importar controladores
const categoryController = require('../controllers/category.controller');

// Rutas CRUD para Categorías

//Obtiene todas las categorías.
router.get('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), categoryController.getAllCategories);
//Obtiene una categoría por su ID.
router.get('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), categoryController.getCategoryById);
//	Crea una nueva categoría.
router.post('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), categoryController.createCategory);
//Actualiza una categoría por ID.
router.put('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), categoryController.updateCategory);
//Elimina una categoría de la base de datos.
router.delete('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), categoryController.deleteCategory);

module.exports = router;
