/* This JavaScript code snippet is setting up a router using the Express framework for a Node.js
application. Here's a breakdown of what each part is doing: */
const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

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

// Rutas para Alexa Account Linking
router.get('/alexa/authorize', [
  query('client_id').notEmpty().withMessage('Se requiere el client_id'),
  query('redirect_uri').notEmpty().withMessage('Se requiere el redirect_uri'),
  query('response_type').equals('code').withMessage('El response_type debe ser "code"'),
  query('state').notEmpty().withMessage('Se requiere el state'),
], authLimiter, authController.alexaAuthorize);

router.post('/alexa/token', [
  body('grant_type').isIn(['authorization_code', 'refresh_token']).withMessage('grant_type inválido'),
  body('client_id').notEmpty().withMessage('Se requiere el client_id'),
  body('client_secret').notEmpty().withMessage('Se requiere el client_secret'),
], authLimiter, authController.alexaToken);

router.post('/alexa/complete-authorization', [
  body('user_id').isInt().withMessage('Se requiere el user_id'),
  body('redirect_uri').notEmpty().withMessage('Se requiere el redirect_uri'),
  body('state').notEmpty().withMessage('Se requiere el state'),
  body('scope').optional().isString().withMessage('Scope debe ser una cadena'),
], authLimiter, authController.alexaCompleteAuthorization);

module.exports = router;