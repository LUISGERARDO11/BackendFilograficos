const express = require('express');
const router = express.Router();

// Importar controladores
const productAttributeController = require('../controllers/productAttributeController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// ** RUTAS PARA ATRIBUTOS DE PRODUCTOS **

// Obtener la cantidad de atributos por categorías (requiere autenticación y rol de administrador)
router.get(
  '/count-by-category',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.getAttributeCountByCategory
);

// Obtener todos los atributos de acuerdo a una categoría (requiere autenticación y rol de administrador)
router.get(
  '/by-category/:category_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.getAttributesByCategory
);

// Obtener todos los atributos de acuerdo a una categoría (requiere autenticación y rol de administrador) sin paginacion
router.get(
  '/by-category-without-pagination/:category_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.getAttributesByCategoryWithoutPagination
);

// Crear un nuevo atributo (requiere autenticación y rol de administrador)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.createAttribute
);

// Actualizar un atributo existente (requiere autenticación y rol de administrador)
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.updateAttribute
);

// Eliminar lógicamente un atributo (requiere autenticación y rol de administrador)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAttributeController.deleteAttribute
);

module.exports = router;