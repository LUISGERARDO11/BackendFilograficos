/* This JavaScript code snippet defines several functions related to security configurations and user
management in a web application. Here is a breakdown of what each function does: */
const { body, validationResult } = require('express-validator');
const incidentUtils = require('../utils/incidentUtils');
const loggerUtils = require('../utils/loggerUtils');
const { User, FailedAttempt } = require('../models/Associations');
const Config = require('../models/Systemconfig');

// Middleware de validación para updateTokenLifetime
const validateSecurityConfig = [
  body('jwt_lifetime').optional().isInt({ min: 300, max: 2592000 }).withMessage('JWT: 5min a 30días').toInt(),
  body('email_verification_lifetime').optional().isInt({ min: 300, max: 2592000 }).withMessage('Verificación email: 5min a 30días').toInt(),
  body('otp_lifetime').optional().isInt({ min: 60, max: 1800 }).withMessage('OTP: 1 a 30min').toInt(),
  body('session_lifetime').optional().isInt({ min: 300, max: 2592000 }).withMessage('Sesión: 5min a 30días').toInt(),
  body('cookie_lifetime').optional().isInt({ min: 300, max: 2592000 }).withMessage('Cookie: 5min a 30días').toInt(),
  body('expiration_threshold_lifetime').optional().isInt({ min: 60, max: 1800 }).withMessage('Expiration Threshold: 1 a 30min').toInt(),
  body('max_failed_login_attempts').optional().isInt({ min: 3, max: 10 }).withMessage('Intentos fallidos: 3-10').toInt(),
  body('max_blocks_in_n_days').optional().isInt({ min: 1, max: 10 }).withMessage('Bloqueos máximos: 1-10').toInt(),
  body('block_period_days').optional().isInt({ min: 1, max: 365 }).withMessage('Periodo bloqueo: 1-365 días').toInt(),
];

// Función auxiliar para manejar errores y respuestas
const sendErrorResponse = (res, error, message = 'Error procesando solicitud') => {
  loggerUtils.logCriticalError(error);
  res.status(500).json({ message, error: error.message });
};

// Función auxiliar para manejar respuestas exitosas
const sendSuccessResponse = (res, message, data = {}) => {
  res.status(200).json({ message, ...data });
};

// Función auxiliar para registrar actividad
const logActivity = (userId, action, description) => {
  loggerUtils.logUserActivity(userId || 'admin', action, description);
};

// Obtener historial de intentos fallidos
exports.getFailedLoginAttempts = async (req, res) => {
  const { periodo } = req.query;

  try {
    const { clientes, administradores } = await incidentUtils.getFailedAttemptsData(periodo);
    loggerUtils.logSecurityEvent(
      req.user?.user_id || 'admin',
      'failed-login-attempts',
      'view',
      `Consulta de intentos fallidos en periodo ${periodo}`
    );
    sendSuccessResponse(res, 'Intentos fallidos obtenidos', { clientes, administradores });
  } catch (error) {
    sendErrorResponse(res, error, 'Error obteniendo intentos fallidos');
  }
};

// Actualizar configuración de seguridad
exports.updateTokenLifetime = [
  validateSecurityConfig,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updateFields = Object.fromEntries(
      [
        'jwt_lifetime',
        'email_verification_lifetime',
        'otp_lifetime',
        'session_lifetime',
        'cookie_lifetime',
        'expiration_threshold_lifetime',
        'max_failed_login_attempts',
        'max_blocks_in_n_days',
        'block_period_days',
      ]
        .map(field => [field, req.body[field]])
        .filter(([_, value]) => value !== undefined)
    );

    if (!Object.keys(updateFields).length) {
      return res.status(400).json({ message: 'Campos de actualización requeridos' });
    }

    try {
      const [config, created] = await Config.findOrCreate({
        where: {},
        defaults: updateFields,
      });

      if (!created) await config.update(updateFields);

      logActivity(req.user?.user_id, 'update', 'Configuración de seguridad actualizada');
      sendSuccessResponse(res, 'Configuración actualizada', { config: config.get({ plain: true }) });
    } catch (error) {
      sendErrorResponse(res, error, 'Error actualizando configuración');
    }
  },
];

// Desbloquear usuario como administrador
exports.adminUnlockUser = async (req, res) => {
  const { user_id } = req.params;

  try {
    const user = await User.findByPk(user_id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    if (user.status !== 'bloqueado_permanente') {
      return res.status(400).json({ message: 'Usuario no bloqueado permanentemente' });
    }

    await user.update({ status: 'activo' });
    await FailedAttempt.update({ is_resolved: true }, { where: { user_id } });

    logActivity(req.user.user_id, 'admin_unlock', `Usuario ${user_id} desbloqueado`);
    sendSuccessResponse(res, 'Usuario desbloqueado exitosamente');
  } catch (error) {
    sendErrorResponse(res, error, 'Error desbloqueando usuario');
  }
};

// Obtener configuración del sistema
exports.getConfig = async (req, res) => {
  try {
    const config = await Config.findOne();
    if (!config) return res.status(404).json({ message: 'No se encontró ninguna configuración' });

    sendSuccessResponse(res, 'Configuración obtenida', { config });
  } catch (error) {
    sendErrorResponse(res, error, 'Error al obtener la configuración');
  }
};