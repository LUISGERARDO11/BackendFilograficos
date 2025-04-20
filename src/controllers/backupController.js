const { body, query, validationResult } = require('express-validator');
const backupService = require('../services/backupService');
const loggerUtils = require('../utils/loggerUtils');

// Validaciones para configurar respaldos
exports.configureBackup = [
  body('frequency')
    .isIn(['daily', 'weekly', 'monthly'])
    .withMessage('La frecuencia debe ser "daily", "weekly" o "monthly"'),
  body('data_types')
    .isArray()
    .withMessage('data_types debe ser un arreglo')
    .notEmpty()
    .withMessage('data_types no puede estar vacío'),
  body('data_types.*')
    .isIn(['transactions', 'clients', 'configuration', 'full'])
    .withMessage('Cada elemento de data_types debe ser "transactions", "clients", "configuration" o "full"'),
  body('schedule_time')
    .matches(/^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/)
    .withMessage('schedule_time debe estar en formato HH:mm:ss (24 horas)'),

  async (req, res) => {
    const userId = req.user.user_id;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const { frequency, data_types, schedule_time } = req.body;
      const config = await backupService.getConfig();

      if (!config) {
        return res.status(400).json({ success: false, message: 'Primero autentica con Google Drive' });
      }

      const updatedConfig = await BackupConfig.findOne({ where: { storage_type: 'google_drive' } });
      await updatedConfig.update({
        frequency,
        data_types: JSON.stringify(data_types),
        schedule_time,
        created_by: userId
      });

      loggerUtils.logUserActivity(userId, 'configure_backup', `Configuración de respaldo actualizada por el usuario ${userId}`);
      res.status(200).json({
        success: true,
        message: 'Configuración de respaldo actualizada',
        config: {
          ...updatedConfig.toJSON(),
          data_types: JSON.parse(updatedConfig.data_types)
        }
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al configurar el respaldo',
        error: error.message
      });
    }
  }
];

// Obtener configuración de respaldo
exports.getBackupConfig = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const config = await backupService.getConfig();

    res.status(200).json({
      success: true,
      config: config || {}
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la configuración de respaldo',
      error: error.message
    });
  }
};

// Generar URL de autenticación con Google
exports.getGoogleAuthUrl = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const authUrl = await backupService.getAuthUrl();

    loggerUtils.logUserActivity(userId, 'get_google_auth_url', `URL de autenticación de Google generada por el usuario ${userId}`);
    res.status(200).json({
      success: true,
      authUrl
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al generar la URL de autenticación',
      error: error.message
    });
  }
};

// Manejar callback de Google OAuth2
exports.handleGoogleAuthCallback = [
  query('code').notEmpty().withMessage('El código de autorización es requerido'),

  async (req, res) => {
    const userId = req.user.user_id;
    const { code } = req.query;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      await backupService.handleOAuthCallback(code, userId);

      loggerUtils.logUserActivity(userId, 'google_auth_callback', `Autenticación con Google Drive completada por el usuario ${userId}`);
      res.status(200).send('Autenticación exitosa. Puedes cerrar esta ventana.');
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).send(`Error: ${error.message}`);
    }
  }
];

// Ejecutar respaldo manual
exports.runBackup = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const config = await backupService.getConfig();
    if (!config) {
      return res.status(400).json({ success: false, message: 'No hay configuración de respaldo' });
    }

    const backup = await backupService.generateBackup(userId, config.data_types);

    loggerUtils.logUserActivity(userId, 'run_backup', `Respaldo manual ejecutado por el usuario ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Respaldo ejecutado exitosamente',
      backup
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al ejecutar el respaldo',
      error: error.message
    });
  }
};

// Restaurar respaldo
exports.restoreBackup = [
  body('backup_id')
    .isInt({ min: 1 })
    .withMessage('El ID del respaldo debe ser un número entero positivo'),

  async (req, res) => {
    const userId = req.user.user_id;
    const { backup_id } = req.body;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const restoration = await backupService.restoreBackup(userId, backup_id);

      loggerUtils.logUserActivity(userId, 'restore_backup', `Restauración ejecutada para backup_id ${backup_id} por el usuario ${userId}`);
      res.status(200).json({
        success: true,
        message: 'Restauración ejecutada exitosamente',
        restoration
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al restaurar el respaldo',
        error: error.message
      });
    }
  }
];

// Listar respaldos
exports.listBackups = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const backups = await backupService.listBackups();

    res.status(200).json({
      success: true,
      backups
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al listar los respaldos',
      error: error.message
    });
  }
};