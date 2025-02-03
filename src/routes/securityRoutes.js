const express = require('express');
const router = express.Router();

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Importar controladores
const securityController = require('../controllers/securityController');

// ** USUARIOS BLOQUEADOS **
// Ruta para obtener el historial de intentos fallidos de inicio de sesión
router.get('/failed-attempts', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.getFailedLoginAttempts);

// ** CONFIGURACIÓN DE BLOQUEO ** 
// Ruta para desbloquear a un usuario bloqueado por múltiples intentos fallidos
router.put('/unlock-user/:userId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.adminUnlockUser);

// ** CONFIGURACIÓN DE SEGURIDAD **
// Ruta para actualizar el tiempo de vida de los tokens
router.put('/update-token-lifetime', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.updateTokenLifetime);

// Ruta para obtener la configuración del sistema relacionada con la seguridad
router.get('/token-lifetime', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.getConfig);

module.exports = router;
