/* This JavaScript code snippet is setting up a router using Express.js, a popular Node.js web
application framework. Here's a breakdown of what the code is doing: */
const express = require('express');
const router = express.Router();

// Importar controladores
const passwordController = require('../controllers/passwordController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const { authLimiter } = require('../middlewares/expressRateLimit');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Verificar si una contraseña está comprometida
router.post('/check-password', authLimiter, passwordController.checkPassword);

// Cambiar la contraseña del usuario autenticado 
router.put('/change-password', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, passwordController.changePassword );

// Iniciar el proceso de recuperación de contraseña
router.post('/initiate-password-recovery', passwordController.initiatePasswordRecovery);

// Verificar el código OTP para recuperación de contraseña
router.post('/verify-otp', authLimiter, passwordController.verifyOTP);

// Restablecer la contraseña después de verificar OTP
router.post('/reset-password', authLimiter, passwordController.resetPassword);

module.exports = router;
