/* This JavaScript code snippet defines several functions related to security configurations and user
management in a web application. Here is a breakdown of what each function does: */
const { body, validationResult } = require('express-validator');
const incidentUtils = require('../utils/incidentUtils');
const loggerUtils = require('../utils/loggerUtils');
const { sequelize } = require('../config/dataBase');
const { User,FailedAttempt } = require('../models/Associations');
const Config = require('../models/Systemconfig');

// Obtener usuarios bloqueados permanentemente
exports.getBlockedUsers = async (req, res) => {
  try {
    const blockedUsers = await User.findAll({
      where: { status: 'bloqueado_permanente' }, // Filtra solo los bloqueados
      attributes: ['user_id', 'nombre', 'email', 'tipo_usuario', 'createdAt'], // Selecciona solo los campos necesarios
      order: [['createdAt', 'DESC']] // Ordena por fecha de bloqueo
    });

    if (!blockedUsers.length) {
      return res.status(404).json({ message: 'No hay usuarios bloqueados permanentemente.' });
    }

    res.status(200).json({ blockedUsers });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener usuarios bloqueados', error: error.message });
  }
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

    res.status(200).json({ clientes, administradores });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error obteniendo intentos fallidos', error: error.message });
  }
};

// Actualizar configuración de seguridad
exports.updateTokenLifetime = [
  body('jwt_lifetime')
    .optional()
    .isInt({ min: 300, max: 2592000 }).withMessage('JWT: 5min a 30días')
    .toInt(),
  body('email_verification_lifetime')
    .optional()
    .isInt({ min: 300, max: 2592000 }).withMessage('Verificación email: 5min a 30días')
    .toInt(),
  body('otp_lifetime')
    .optional()
    .isInt({ min: 60, max: 1800 }).withMessage('OTP: 1 a 30min')
    .toInt(),
  body('session_lifetime')
    .optional()
    .isInt({ min: 300, max: 2592000 }).withMessage('Sesión: 5min a 30días')
    .toInt(),
  body('cookie_lifetime')
    .optional()
    .isInt({ min: 300, max: 2592000 }).withMessage('Cookie: 5min a 30días')
    .toInt(),
  body('expiration_threshold_lifetime')
    .optional()
    .isInt({ min: 60, max: 1800 }).withMessage('Expiration Threshold: 1 a 30min')
    .toInt(),
  body('max_failed_login_attempts')
    .optional()
    .isInt({ min: 3, max: 10 }).withMessage('Intentos fallidos: 3-10')
    .toInt(),
  body('max_blocks_in_n_days')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('Bloqueos máximos: 1-10')
    .toInt(),
  body('block_period_days')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Periodo bloqueo: 1-365 días')
    .toInt(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())  return res.status(400).json({ errors: errors.array() });

    const updateFields = {};
    const allowedFields = [
      'jwt_lifetime',
      'email_verification_lifetime',
      'otp_lifetime',
      'session_lifetime',
      'cookie_lifetime',
      'expiration_threshold_lifetime',
      'max_failed_login_attempts',
      'max_blocks_in_n_days',
      'block_period_days'
    ];

    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updateFields[field] = req.body[field];
    });

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ message: 'Campos de actualización requeridos' });
    }

    try {
      const [config, created] = await Config.findOrCreate({
        where: {},
        defaults: updateFields
      });

      if (!created) await config.update(updateFields);

      loggerUtils.logUserActivity(
        req.user?.user_id || 'admin',
        'update',
        'Configuración de seguridad actualizada'
      );

      res.status(200).json({ 
        message: 'Configuración actualizada',
        config: config.get({ plain: true })
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error actualizando configuración', error: error.message });
    }
  }
];

// Desbloquear usuario como administrador
exports.adminUnlockUser = async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await User.findByPk(user_id);
    if (!user) {
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }

    if (user.status !== 'bloqueado_permanente') {
      return res.status(400).json({ message: 'Usuario no bloqueado permanentemente' });
    }

    await user.update({ status: 'activo' });
    await FailedAttempt.update(
      { is_resolved: true },
      { where: { user_id } }
    );

    loggerUtils.logUserActivity(
      req.user.user_id,
      'admin_unlock',
      `Usuario ${user_id} desbloqueado`
    );

    res.status(200).json({ message: 'Usuario desbloqueado exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error desbloqueando usuario', error: error.message });
  }
};

// Obtener configuración del sistema
exports.getConfig = async (req, res) => {
    try {
      const config = await Config.findOne();
  
      if (!config) {
        return res.status(404).json({ message: "No se encontró ninguna configuración." });
      }
  
      res.status(200).json({ config });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: "Error al obtener la configuración.", error: error.message });
    }
};