// routes/models3dRoutes.js
const express = require('express');
const router = express.Router();

// Importar controladores
const models3dController = require('../controllers/models3dController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para crear un nuevo modelo 3D (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  models3dController.createModel3d
);

// Ruta para obtener todos los modelos 3D (pública, para la app móvil)
router.get(
  '/',
  models3dController.getAllModels3d
);

// Ruta para obtener un modelo 3D por ID
router.get(
  '/:id',
  models3dController.getModel3dById
);

// Ruta para actualizar un modelo 3D (solo administradores)
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  models3dController.updateModel3d
);

// Ruta para eliminar un modelo 3D (solo administradores)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  models3dController.deleteModel3d
);

module.exports = router;