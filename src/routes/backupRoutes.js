const express = require('express');
const router = express.Router();

// Importar controlador
const backupController = require('../controllers/backupController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para obtener la URL de autenticación con Google
router.get(
  '/auth/google',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.getGoogleAuthUrl
);

// Ruta para manejar el callback de Google OAuth2
router.get(
  '/auth/google/callback',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.handleGoogleAuthCallback
);

// Ruta para configurar respaldos
router.post(
  '/config',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.configureBackup
);

// Ruta para obtener la configuración de respaldos
router.get(
  '/config',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.getBackupConfig
);

// Ruta para listar respaldos
router.get(
  '/history',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.listBackups
);

// Ruta para ejecutar un respaldo manual
router.post(
  '/run',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.runBackup
);

// Ruta para restaurar un respaldo
router.post(
  '/restore',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  backupController.restoreBackup
);

module.exports = router;