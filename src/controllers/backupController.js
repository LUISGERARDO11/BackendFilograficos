const { body, query, param, validationResult } = require('express-validator');
const backupService = require('../services/backupService');
const { BackupConfig, BackupLog } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Validaciones para configurar respaldos
exports.configureBackup = [
  param('backup_type')
    .isIn(['full', 'differential', 'transactional'])
    .withMessage('El backup_type debe ser "full", "differential" o "transactional"'),
  body('frequency')
    .isIn(['daily', 'weekly', 'hourly'])
    .withMessage('La frecuencia debe ser "daily", "weekly" o "hourly"'),
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
    const { backup_type } = req.params;
    const { frequency, data_types, schedule_time } = req.body;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      // Validaciones adicionales según backup_type
      if (backup_type === 'full' && frequency !== 'weekly') {
        return res.status(400).json({ success: false, message: 'El respaldo completo debe tener frecuencia "weekly"' });
      }
      if (backup_type === 'differential' && frequency !== 'daily') {
        return res.status(400).json({ success: false, message: 'El respaldo diferencial debe tener frecuencia "daily"' });
      }
      if (backup_type === 'transactional' && frequency !== 'hourly') {
        return res.status(400).json({ success: false, message: 'El respaldo transaccional debe tener frecuencia "hourly"' });
      }
      if (backup_type === 'transactional' && (data_types.length !== 1 || data_types[0] !== 'transactions')) {
        return res.status(400).json({ success: false, message: 'El respaldo transaccional solo puede incluir "transactions"' });
      }
      if (backup_type === 'full' && (data_types.length !== 1 || data_types[0] !== 'full')) {
        return res.status(400).json({ success: false, message: 'El respaldo completo solo puede incluir "full"' });
      }

      // Verificar autenticación con Google Drive
      const existingConfig = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type } });
      if (!existingConfig || !existingConfig.refresh_token || !existingConfig.folder_id) {
        return res.status(400).json({ success: false, message: 'Primero autentica con Google Drive para este tipo de respaldo' });
      }

      // Crear o actualizar configuración
      let updatedConfig = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type } });
      if (updatedConfig) {
        await updatedConfig.update({
          frequency,
          data_types,
          schedule_time,
          created_by: userId
        });
      } else {
        updatedConfig = await BackupConfig.create({
          backup_type,
          frequency,
          data_types,
          storage_type: 'google_drive',
          refresh_token: existingConfig.refresh_token,
          folder_id: existingConfig.folder_id,
          schedule_time,
          created_by: userId
        });
      }

      loggerUtils.logUserActivity(userId, 'configure_backup', `Configuración de respaldo ${backup_type} actualizada por el usuario ${userId}`);
      res.status(200).json({
        success: true,
        message: 'Configuración de respaldo actualizada',
        config: {
          ...updatedConfig.toJSON(),
          data_types: updatedConfig.data_types
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

// Obtener configuración de respaldo por tipo
exports.getBackupConfig = [
  param('backup_type')
    .isIn(['full', 'differential', 'transactional'])
    .withMessage('El backup_type debe ser "full", "differential" o "transactional"'),
  async (req, res) => {
    const userId = req.user.user_id;
    const { backup_type } = req.params;

    try {
      const config = await backupService.getConfig(backup_type);

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
  }
];

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
exports.runBackup = [
  param('backup_type')
    .isIn(['full', 'differential', 'transactional'])
    .withMessage('El backup_type debe ser "full", "differential" o "transactional"'),
  async (req, res) => {
    const userId = req.user.user_id;
    const { backup_type } = req.params;

    try {
      const config = await backupService.getConfig(backup_type);
      if (!config) {
        return res.status(400).json({ success: false, message: `No hay configuración para respaldo ${backup_type}` });
      }

      const backup = await backupService.generateBackup(userId, config.data_types, backup_type);

      loggerUtils.logUserActivity(userId, 'run_backup', `Respaldo manual ${backup_type} ejecutado por el usuario ${userId}`);
      res.status(200).json({
        success: true,
        message: `Respaldo ${backup_type} ejecutado exitosamente`,
        backup
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: `Error al ejecutar el respaldo ${backup_type}`,
        error: error.message
      });
    }
  }
];

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

      // Verificar el tipo de respaldo
      const backupLog = await BackupLog.findOne({ where: { backup_id } });
      if (!backupLog) {
        return res.status(400).json({ success: false, message: 'Respaldo no encontrado' });
      }
      if (!['full', 'differential', 'transactional'].includes(backupLog.data_type)) {
        return res.status(400).json({ success: false, message: 'Tipo de respaldo no soportado para restauración' });
      }

      const restoration = await backupService.restoreBackup(userId, backup_id);

      loggerUtils.logUserActivity(userId, 'restore_backup', `Restauración ejecutada para backup_id ${backup_id} (${backupLog.data_type}) por el usuario ${userId}`);
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
exports.listBackups = [
  query('backup_type')
    .optional()
    .isIn(['full', 'differential', 'transactional', 'static'])
    .withMessage('El backup_type debe ser "full", "differential", "transactional" o "static"'),
  async (req, res) => {
    const userId = req.user.user_id;
    const { backup_type } = req.query;

    try {
      const where = backup_type ? { data_type: backup_type } : {};
      const backups = await backupService.listBackups(where);

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
  }
];