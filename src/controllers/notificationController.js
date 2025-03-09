const { body, validationResult } = require('express-validator');
const { PushSubscription } = require('../models/Associations');
const NotificationService = require('../services/notificationService'); // Importar la clase
const loggerUtils = require('../utils/loggerUtils');

const notificationService = new NotificationService(); // Instanciar aquí

// Middleware de validación
const validateSubscription = [
  body('endpoint').trim().notEmpty().withMessage('El endpoint es obligatorio').escape(),
  body('keys.p256dh').trim().notEmpty().withMessage('La clave p256dh es obligatoria').escape(),
  body('keys.auth').trim().notEmpty().withMessage('La clave auth es obligatoria').escape(),
];

// Endpoint para suscribirse a notificaciones push
exports.subscribeToPush = [
  validateSubscription,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { endpoint, keys } = req.body;
    const userId = req.user.user_id;

    try {
      // Validar que el usuario existe (opcional, dependiendo de tu lógica)
      // Aquí podrías agregar una consulta a la tabla User si lo deseas

      // Guardar o actualizar la suscripción
      const subscriptionData = {
        endpoint,
        keys: {
          p256dh: keys.p256dh,
          auth: keys.auth,
        },
      };
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