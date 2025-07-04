/* This JavaScript code snippet is setting up a router using the Express framework for a Node.js
application. Here's a breakdown of what each part is doing: */
const express = require('express');
const router = express.Router();

// Importar controladores
const authController = require('../controllers/authController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/expressRateLimit');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Registro de un nuevo usuario
router.post('/register', authLimiter, authController.register);

// Verificación de correo electrónico del usuario
router.get('/verify-email', authController.verifyEmail);

// Inicio de sesión y obtención de JWT
router.post('/login', authController.login);

// Envío del OTP para autenticación multifactor
router.post('/mfa/send-otp', authController.sendOtpMfa);

// Verificación del código OTP para MFA
router.post('/mfa/verify-otp', authController.verifyOTPMFA);

// Cierre de sesión
router.post('/logout', authMiddleware, authController.logout);

// Nueva ruta para autenticación de Alexa
router.post('/alexa-login', authController.alexaLogin);

// Nueva ruta para revocar tokens (protegida para administradores)
router.post('/revoke-token', authMiddleware, roleMiddleware(['administrador']), authController.revokeToken);

module.exports = router;