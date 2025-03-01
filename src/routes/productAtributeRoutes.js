const express = require('express');
const router = express.Router();

// Importar controladores
const productAtributeController = require('../controllers/productAtributeController');

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
  productAtributeController.getAttributeCountByCategory
);

// Obtener todos los atributos de acuerdo a una categoría (requiere autenticación y rol de administrador)
router.get(
  '/by-category/:category_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAtributeController.getAttributesByCategory
);

// Crear un nuevo atributo (requiere autenticación y rol de administrador)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAtributeController.createAttribute
);

// Actualizar un atributo existente (requiere autenticación y rol de administrador)
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAtributeController.updateAttribute
);

// Eliminar lógicamente un atributo (requiere autenticación y rol de administrador)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  productAtributeController.deleteAttribute
);

module.exports = router;