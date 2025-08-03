const express = require('express');
const router = express.Router();

// Importar controladores
const clientClusterController = require('../controllers/clientClusterController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// ** GESTIÓN DE CLÚSTERES DE CLIENTES **

// Ruta para asignar o actualizar un clúster de cliente
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  clientClusterController.setClientCluster
);

// Ruta para obtener todos los clústeres de clientes
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  clientClusterController.getAllClientClusters
);

// Ruta para obtener un clúster por user_id
router.get(
  '/:user_id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  clientClusterController.getClusterByUserId
);

module.exports = router;