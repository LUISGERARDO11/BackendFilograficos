/* This code snippet is setting up a router in a Node.js application using Express framework. It
defines several routes related to security features of the application. Here's a breakdown of what
the code is doing: */
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
router.put('/unlock-user/:user_id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.adminUnlockUser);

// ** CONFIGURACIÓN DE SEGURIDAD **
// Ruta para actualizar el tiempo de vida de los tokens
router.put('/update-token-lifetime', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.updateTokenLifetime);

// Ruta para obtener la configuración del sistema relacionada con la seguridad
router.get('/token-lifetime', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.getConfig);

router.get('/blocked-users', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), securityController.getBlockedUsers);

module.exports = router;
