/* The above code is a Node.js application that handles user registration, email verification, login,
logout, and two-factor authentication (2FA) using OTP (One-Time Password). Here is a summary of the
main functionalities: */
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { User, Account, Session, TwoFactorConfig, PasswordStatus, CommunicationPreference, RevokedToken } = require('../models/Associations');
const authService = require('../services/authService');
const EmailService = require('../services/emailService');
const loggerUtils = require('../utils/loggerUtils');
const authUtils = require('../utils/authUtils');
const verifyRecaptcha = require('../utils/googleUtils');
const crypto = require('crypto');
require('dotenv').config();

// Instanciamos el servicio de email
const emailService = new EmailService();

// ** GESTION DE USUARIOS **

// Registro de usuarios
exports.register = [
  // Validar y sanitizar entradas
  body('name').isString().trim().escape(),
  body('email').isEmail().normalizeEmail(),
  body('phone').isString().trim().escape(),
  body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres').trim().escape(),
  body('user_type').isIn(['cliente', 'administrador']).withMessage('Tipo de usuario no válido'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email, phone, password, user_type } = req.body;

    try {
      // Validar si el usuario ya existe
      let existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(400).json({ message: 'El correo ya está en uso.' });
      }

      // Crear el nuevo usuario
      const newUser = await User.create({
        name,
        email,
        phone,
        user_type,
        status: 'pendiente',
      });

      // Cifrar la contraseña utilizando el servicio
      const hashedPassword = await authService.hashPassword(password);

      // Crear una cuenta vinculada al usuario
      const newAccount = await Account.create({
        user_id: newUser.user_id,
        password_hash: hashedPassword,
        last_access: new Date(),
        max_failed_login_attempts: 5,
      });

      // Crear el estado de la contraseña
      await PasswordStatus.create({
        account_id: newAccount.account_id,
        requires_change: false,
        last_change_date: new Date(),
      });

      // Crear las preferencias de comunicación por defecto
      await CommunicationPreference.create({
        user_id: newUser.user_id,
        methods: ['email'],
      });

      // Generar token de verificación
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const config = await authService.getConfig();
      const verificationLifetime = config.email_verification_lifetime * 1000;

      newUser.email_verification_expiration = new Date(Date.now() + verificationLifetime);
      newUser.email_verification_token = verificationToken;
      await newUser.save();

      const emailResult = await emailService.sendVerificationEmail(newUser.email, verificationToken);
      if (!emailResult.success) {
        loggerUtils.logUserActivity(newUser.user_id, 'email_verification_failed', `Fallo al enviar correo de verificación a ${newUser.email}`);
        return res.status(500).json({
          message: 'Usuario registrado, pero fallo al enviar el correo de verificación.',
          error: emailResult.messageId || 'No se recibió información del error',
        });
      }

      loggerUtils.logUserActivity(newUser.user_id, 'account_creation', 'Usuario registrado exitosamente');
      res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: newUser,
        emailInfo: { messageId: emailResult.messageId },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error en el registro de usuario', error: error.message });
    }
  },
];

// Verificar el correo electrónico del usuario
exports.verifyEmail = async (req, res) => {
  const { token } = req.query;

  try {
    const user = await User.findOne({
      where: {
        email_verification_token: token,
        email_verification_expiration: { [Op.gt]: Date.now() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Token inválido o expirado.' });
    }

    user.status = 'activo';
    user.email_verification_token = null;
    user.email_verification_expiration = null;
    await user.save();

    const baseUrls = {
      development: ['http://localhost:3000', 'http://localhost:4200', 'http://127.0.0.1:4200', 'http://127.0.0.1:3000'],
      production: ['https://ecommerce-filograficos.vercel.app/'],
    };

    const currentEnv = baseUrls[process.env.NODE_ENV] ? process.env.NODE_ENV : 'development';
    const loginUrl = `${baseUrls[currentEnv][0]}/login`;

    res.redirect(loginUrl);
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar el correo', error: error.message });
  }
};

// Inicio de sesión
exports.login = [
  body('email').isEmail().normalizeEmail(),
  body('password').not().isEmpty().trim().escape(),
  //body('recaptchaToken').not().isEmpty().withMessage('Se requiere el token de reCAPTCHA'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, recaptchaToken } = req.body;

    try {
      /*const recaptchaValid = await verifyRecaptcha(recaptchaToken, res);
      if (!recaptchaValid) {
        return;
      }*/

      const user = await User.findOne({ where: { email } });
      if (!user) {
        loggerUtils.logUserActivity(null, 'login_failed', `Intento de inicio de sesión fallido para email no encontrado: ${email}`);
        return res.status(400).json({ message: 'Usuario no encontrado' });
      }

      if (user.status === 'pendiente') {
        loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Intento de inicio de sesión con cuenta pendiente de verificación');
        return res.status(403).json({ message: 'Debes verificar tu correo electrónico antes de iniciar sesión.' });
      }

      const account = await Account.findOne({ where: { user_id: user.user_id } });
      if (!account) {
        loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Intento de inicio de sesión fallido: cuenta no encontrada');
        return res.status(400).json({ message: 'Cuenta no encontrada' });
      }

      const bloqueado = await authService.isUserBlocked(user.user_id);
      if (bloqueado.blocked) {
        loggerUtils.logUserActivity(user.user_id, 'login_failed', `Cuenta bloqueada: ${bloqueado.message}`);
        return res.status(403).json({ message: bloqueado.message });
      }

      const isMatch = await authService.verifyPassword(password, account.password_hash);
      if (!isMatch) {
        const result = await authService.handleFailedAttempt(user.user_id, req.ip);
        if (result.locked) {
          loggerUtils.logUserActivity(user.user_id, 'account_locked', 'Cuenta bloqueada por intentos fallidos');
          return res.status(403).json({ locked: true, message: 'Tu cuenta ha sido bloqueada debido a múltiples intentos fallidos. Debes cambiar tu contraseña.' });
        }
        return res.status(400).json({ message: 'Credenciales incorrectas', ...result });
      }

      await authService.clearFailedAttempts(user.user_id);

      const activeSessionsCount = await Session.count({ where: { user_id: user.user_id, revoked: false } });
      if (user.user_type === 'cliente' && activeSessionsCount >= 5) {
        loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Límite de sesiones activas alcanzado');
        return res.status(403).json({ message: 'Límite de sesiones activas alcanzado (5 sesiones permitidas).' });
      }
      if (user.user_type === 'administrador' && activeSessionsCount >= 3) {
        loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Límite de sesiones activas alcanzado');
        return res.status(403).json({ message: 'Límite de sesiones activas alcanzado (3 sesiones permitidas para administradores).' });
      }

      const mfaConfig = await TwoFactorConfig.findOne({ where: { account_id: account.account_id } });
      if (mfaConfig && mfaConfig.enabled) {
        return res.status(200).json({
          message: 'MFA requerido. Se ha enviado un código de autenticación.',
          mfaRequired: true,
          userId: user.user_id,
          name: user.name,
          tipo: user.user_type
        });
      }

      const { token, session } = await authService.createSession(user, req.ip, req.headers['user-agent']);
      const config = await authService.getConfig();

      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production", // True en producción, false en desarrollo local
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // Lax para desarrollo local
        maxAge: config.session_lifetime * 1000 // 15 min en milisegundos
      });

      loggerUtils.logUserActivity(user.user_id, 'login', 'Inicio de sesión exitoso');
      res.status(200).json({
        userId: user.user_id,
        name: user.name,
        tipo: user.user_type,
        message: 'Inicio de sesión exitoso'
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error en el inicio de sesión', error: error.message });
    }
  },
];

// Cerrar sesión del usuario
exports.logout = async (req, res) => {
  const token = req.cookies.token;

  if (!token) {
    return res.status(401).json({
      message: 'No se proporcionó un token. Ya estás cerrado sesión o nunca iniciaste sesión.',
    });
  }

  try {
    const userId = req.user ? req.user.user_id : null;
    if (!userId) {
      return res.status(400).json({ message: 'Usuario no autenticado.' });
    }

    await authService.revokeSession(token);

    res.clearCookie('token', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'None',
    });

    loggerUtils.logUserActivity(userId, 'logout', 'Sesión cerrada exitosamente');
    res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al cerrar sesión', error: error.message });
  }
};

// Nueva función para autenticación de Alexa
exports.alexaLogin = [
  // Validaciones
  body('email').isEmail().normalizeEmail().withMessage('Correo electrónico inválido'),
  body('password').not().isEmpty().trim().escape().withMessage('La contraseña es requerida'),
  body('client_id')
    .not().isEmpty().withMessage('El client_id es requerido')
    .custom((value) => {
      if (value !== process.env.ALEXA_CLIENT_ID) {
        throw new Error('client_id inválido');
      }
      return true;
    }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, client_id } = req.body;

    try {
      // Buscar usuario por email
      const user = await User.findOne({ where: { email } });
      if (!user) {
        loggerUtils.logUserActivity(null, 'alexa_login_failed', `Intento de inicio de sesión fallido para email no encontrado: ${email}`);
        return res.status(400).json({ message: 'Usuario no encontrado' });
      }

      // Verificar que el usuario sea administrador y esté activo
      if (user.user_type !== 'administrador' || user.status !== 'activo') {
        loggerUtils.logUserActivity(user.user_id, 'alexa_login_failed', 'Intento de inicio de sesión fallido: usuario no es administrador o no está activo');
        return res.status(403).json({ message: 'Acceso no autorizado. Solo administradores activos pueden usar la Skill de Alexa.' });
      }

      // Buscar cuenta asociada
      const account = await Account.findOne({ where: { user_id: user.user_id } });
      if (!account) {
        loggerUtils.logUserActivity(user.user_id, 'alexa_login_failed', 'Intento de inicio de sesión fallido: cuenta no encontrada');
        return res.status(400).json({ message: 'Cuenta no encontrada' });
      }

      // Verificar si el usuario está bloqueado
      const bloqueado = await authService.isUserBlocked(user.user_id);
      if (bloqueado.blocked) {
        loggerUtils.logUserActivity(user.user_id, 'alexa_login_failed', `Cuenta bloqueada: ${bloqueado.message}`);
        return res.status(403).json({ message: bloqueado.message });
      }

      // Verificar contraseña
      const isMatch = await authService.verifyPassword(password, account.password_hash);
      if (!isMatch) {
        const result = await authService.handleFailedAttempt(user.user_id, req.ip);
        if (result.locked) {
          loggerUtils.logUserActivity(user.user_id, 'account_locked', 'Cuenta bloqueada por intentos fallidos');
          return res.status(403).json({ locked: true, message: 'Tu cuenta ha sido bloqueada debido a múltiples intentos fallidos.' });
        }
        return res.status(400).json({ message: 'Credenciales incorrectas', ...result });
      }

      // Limpiar intentos fallidos
      await authService.clearFailedAttempts(user.user_id);

      // Verificar límite de sesiones para Alexa
      const alexaSessionsCount = await Session.count({
        where: { user_id: user.user_id, browser: 'Alexa-Skill', revoked: false }
      });
      if (alexaSessionsCount >= 1) {
        loggerUtils.logUserActivity(user.user_id, 'alexa_login_failed', 'Límite de sesiones de Alexa alcanzado');
        return res.status(403).json({ message: 'Límite de sesiones de Alexa alcanzado (1 sesión permitida).' });
      }

      // Verificar límite total de sesiones (3 para administradores: 1 Alexa + 2 web/móvil)
      const totalSessionsCount = await Session.count({
        where: { user_id: user.user_id, revoked: false }
      });
      if (totalSessionsCount >= 3) {
        loggerUtils.logUserActivity(user.user_id, 'alexa_login_failed', 'Límite total de sesiones alcanzado');
        return res.status(403).json({ message: 'Límite total de sesiones alcanzado (3 sesiones permitidas para administradores).' });
      }

      // Crear sesión para Alexa
      const { token, session } = await authService.createSession(user, req.ip, 'Alexa-Skill');

      loggerUtils.logUserActivity(user.user_id, 'alexa_login', 'Inicio de sesión de Alexa exitoso');
      res.status(200).json({
        access_token: token,
        token_type: 'Bearer',
        expires_in: 30 * 24 * 60 * 60, // 30 días en segundos
        userId: user.user_id,
        name: user.name,
        tipo: user.user_type
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error en el inicio de sesión de Alexa', error: error.message });
    }
  }
];

// Nueva función para revocar tokens
exports.revokeToken = [
  body('token').not().isEmpty().trim().withMessage('El token es requerido'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;
    const userId = req.user ? req.user.user_id : null;

    try {
      // Verificar que el usuario tenga permisos de administrador
      if (!userId || req.user.user_type !== 'administrador') {
        return res.status(403).json({ message: 'Acceso no autorizado. Solo administradores pueden revocar tokens.' });
      }

      // Verificar si el token está en la tabla Session
      const session = await Session.findOne({ where: { token, revoked: false } });
      if (!session) {
        return res.status(400).json({ message: 'Token no encontrado o ya revocado.' });
      }

      // Revocar la sesión
      await authService.revokeSession(token);

      // Agregar el token a la tabla RevokedToken
      await RevokedToken.create({
        token,
        user_id: session.user_id,
        revokedAt: new Date()
      });

      loggerUtils.logUserActivity(userId, 'token_revoked', `Token revocado para user_id: ${session.user_id}`);
      res.status(200).json({ message: 'Token revocado exitosamente.' });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al revocar el token', error: error.message });
    }
  }
];

// ** SEGURIDAD Y AUTENTICACIÓN MULTIFACTOR **
exports.sendOtpMfa = async (req, res) => {
  const { userId } = req.body;

  try {
    // Buscar la cuenta del usuario por userId
    const account = await Account.findOne({
      where: { user_id: userId },
      include: [User],
    });

    if (!account || !account.User) {
      return res.status(404).json({ message: 'Cuenta o usuario no encontrado.' });
    }

    const config = await authService.getConfig();
    const otpLifetime = config.otp_lifetime * 1000;

    // Generar OTP y definir expiración
    const otp = authUtils.generateOTP();
    const expiration = new Date(Date.now() + otpLifetime);

    // Crear o actualizar la configuración 2FA
    const [twofactorconfig] = await TwoFactorConfig.findOrCreate({
      where: { account_id: account.account_id },
      defaults: {
        mfa_type: 'OTP',
        enabled: true,
        code: otp,
        code_expires: expiration,
        attempts: 0,
        is_valid: true,
      },
    });

    // Actualizar si ya existía
    await twofactorconfig.update({
      code: otp,
      code_expires: expiration,
      attempts: 0,
      is_valid: true,
    });

    // Enviar el OTP por correo electrónico
    const emailResult = await emailService.sendMFAOTPEmail(account.User.email, otp);
    if (!emailResult.success) {
      loggerUtils.logUserActivity(userId, 'mfa_otp_email_failed', `Fallo al enviar OTP de autenticación a ${account.User.email}`);
      return res.status(500).json({
        message: 'Error al enviar el OTP.',
        error: emailResult.messageId || 'No se recibió información del error',
      });
    }

    res.status(200).json({
      success: true,
      message: 'OTP enviado correctamente.',
      emailInfo: { messageId: emailResult.messageId },
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al enviar el OTP.', error: error.message });
  }
};

// Verificar el código MFA
exports.verifyOTPMFA = async (req, res) => {
  const { userId, otp } = req.body;

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    const account = await Account.findOne({ where: { user_id: user.user_id } });
    if (!account) {
      return res.status(404).json({ message: 'Cuenta no encontrada' });
    }

    const twoFactorConfig = await TwoFactorConfig.findOne({
      where: { account_id: account.account_id },
    });

    if (!twoFactorConfig || !twoFactorConfig.is_valid || new Date() > twoFactorConfig.code_expires) {
      return res.status(400).json({ message: 'El código OTP ha expirado o es inválido.' });
    }

    if (!twoFactorConfig.code) {
      return res.status(400).json({ message: 'El código OTP no está configurado.' });
    }

    const inputOtp = otp.trim().toUpperCase();
    const storedOtp = twoFactorConfig.code.trim().toUpperCase();

    if (inputOtp !== storedOtp) {
      const newAttempts = twoFactorConfig.attempts + 1;
      const remainingAttempts = 3 - newAttempts;

      await twoFactorConfig.update({
        attempts: newAttempts,
        is_valid: newAttempts >= 3 ? false : twoFactorConfig.is_valid,
      });

      return res.status(400).json({
        message: `OTP incorrecto. Intentos restantes: ${remainingAttempts}.`,
        attemptsRemaining: remainingAttempts,
      });
    }

    await twoFactorConfig.update({
      is_valid: false,
      attempts: 0,
    });

    const { token, session } = await authService.createSession(user, req.ip, req.headers['user-agent']);
    const config = await authService.getConfig();

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
      maxAge: config.session_lifetime * 1000
    });

    loggerUtils.logUserActivity(user.user_id, 'mfa_login', 'Inicio de sesión con MFA exitoso');
    res.status(200).json({
      success: true,
      userId: user.user_id,
      name: user.name,
      tipo: user.user_type,
      message: 'OTP verificado correctamente. Inicio de sesión exitoso.'
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al verificar el OTP.', error: error.message });
  }
};