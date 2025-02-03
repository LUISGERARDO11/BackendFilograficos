const express = require('express');
const router = express.Router();

// Importar controladores
const authController = require('../controllers/authController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/expressRateLimit');

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

module.exports = router;
