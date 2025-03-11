const { body, validationResult } = require('express-validator');
const { PushSubscription } = require('../models/Associations');
const NotificationService = require('../services/notificationService'); // Importar la clase
const loggerUtils = require('../utils/loggerUtils');

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