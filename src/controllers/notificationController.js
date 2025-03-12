const { body, validationResult } = require('express-validator');
const { PushSubscription, NotificationLog } = require('../models/Associations'); // Importamos NotificationLog
const NotificationService = require('../services/notificationService'); // Importar la clase
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

const notificationService = new NotificationService(); // Instanciar aquí

// Middleware de validación
const validateSubscription = [
  body('token').trim().notEmpty().withMessage('El token es obligatorio').escape(),
];

// Endpoint para suscribirse a notificaciones push
exports.subscribeToPush = [
  validateSubscription,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { token } = req.body;
    const userId = req.user.user_id;

    try {
      const subscriptionData = { token };
      const subscription = await notificationService.saveSubscription(userId, subscriptionData);

      // Registrar la actividad
      loggerUtils.logUserActivity(userId, 'subscribe_push', `Usuario ${userId} suscrito a notificaciones push`);

      res.status(201).json({
        message: 'Suscripción a notificaciones push registrada exitosamente.',
        subscriptionId: subscription.subscription_id,
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al registrar la suscripción', error: error.message });
    }
  },
];

// Endpoint para desuscribirse de notificaciones push
exports.unsubscribeFromPush = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const result = await notificationService.removeSubscription(userId);

    if (result.success) {
      res.status(200).json({
        message: result.message,
      });
    } else {
      res.status(404).json({
        message: result.message,
      });
    }
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la suscripción', error: error.message });
  }
};

// Obtener historial de notificaciones
exports.getNotificationHistory = async (req, res) => {
  const userId = req.user.user_id;

  try {
    const notifications = await NotificationLog.findAll({
      where: {
        user_id: userId,
        expires_at: { [Op.gt]: new Date() } // Solo notificaciones no expiradas
      },
      order: [['created_at', 'DESC']], // Ordenar por fecha de creación descendente
      limit: 10 // Limitar a las últimas 10 notificaciones
    });

    res.status(200).json({
      success: true,
      notifications: notifications.map(notification => ({
        notification_id: notification.notification_id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        status: notification.status,
        sent_at: notification.sent_at,
        expires_at: notification.expires_at,
        seen: notification.seen,
        created_at: notification.created_at
      }))
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener el historial de notificaciones',
      error: error.message
    });
  }
};

// Marcar una notificación como vista
exports.markNotificationAsSeen = [
  body('notification_id').trim().notEmpty().withMessage('El ID de la notificación es obligatorio').isInt().withMessage('El ID debe ser un número entero'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.user.user_id;
    const { notification_id } = req.body;

    try {
      const notification = await NotificationLog.findOne({
        where: {
          notification_id,
          user_id: userId
        }
      });

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notificación no encontrada o no pertenece al usuario'
        });
      }

      await notification.update({ seen: true, updated_at: new Date() });
      loggerUtils.logUserActivity(userId, 'mark_notification_seen', `Notificación ${notification_id} marcada como vista por usuario ${userId}`);

      res.status(200).json({
        success: true,
        message: 'Notificación marcada como vista exitosamente'
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al marcar la notificación como vista',
        error: error.message
      });
    }
  }
];