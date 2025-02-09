/* This JavaScript code is setting up a router using the Express framework for a Node.js application.
Here's a breakdown of what each part is doing: */
const express = require('express');
const router = express.Router();
// Importar controladores
const sessionController = require('../controllers/sessionController');
// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Ruta para revocar tokens en caso de actividad sospechosa o múltiples intentos fallidos
router.post('/revoke-tokens', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, sessionController.revokeTokens);

// Ruta para hacer check de autenticación
router.post('/check-auth', sessionController.checkAuth);

module.exports = router;
