/* The NotificationService class handles saving, removing, and sending push notifications to users
based on their preferences and communication methods. */
require('dotenv').config();
const admin = require('firebase-admin');
const loggerUtils = require('../utils/loggerUtils');

class NotificationService {
  constructor() {
    // Cargar las credenciales desde la variable de entorno
    const serviceAccount = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString()
    );

    // Inicializar Firebase Admin solo si no está inicializado
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

    // Log para confirmar inicialización
    loggerUtils.logUserActivity(null, 'firebase_config', `Configurando Firebase Admin - projectId: ${serviceAccount.project_id}`);
  }

  async saveSubscription(userId, subscriptionData) {
    const { PushSubscription } = require('../models/Associations');
    const { token } = subscriptionData;

    try {
      const existingSubscription = await PushSubscription.findOne({
        where: { user_id: userId, endpoint: token },
      });

      if (existingSubscription) {
        return existingSubscription;
      }

      const subscription = await PushSubscription.create({
        user_id: userId,
        endpoint: token,
        p256dh: null,
        auth: null,
      });

      loggerUtils.logUserActivity(userId, 'save_subscription', `Suscripción push guardada para el usuario ${userId}`);
      return subscription;
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al guardar la suscripción: ${error.message}`);
    }
  }

  async removeSubscription(userId) {
    const { PushSubscription } = require('../models/Associations');

    try {
      // Eliminar todas las suscripciones asociadas al userId
      const deletedCount = await PushSubscription.destroy({
        where: { user_id: userId },
      });

      if (deletedCount > 0) {
        loggerUtils.logUserActivity(userId, 'remove_subscription', `Suscripciones eliminadas para el usuario ${userId}`);
        return { success: true, message: 'Suscripciones eliminadas exitosamente' };
      } else {
        loggerUtils.logUserActivity(userId, 'remove_subscription', `No se encontraron suscripciones para eliminar para el usuario ${userId}`);
        return { success: false, message: 'No se encontraron suscripciones para este usuario' };
      }
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al eliminar la suscripción: ${error.message}`);
    }
  }

  async sendPushNotification(userId, title, message, category = 'general') {
    const { PushSubscription, NotificationLog, CommunicationPreference } = require('../models/Associations');

    try {
      const subscriptions = await PushSubscription.findAll({
        where: { user_id: userId },
      });

      if (!subscriptions.length) {
        throw new Error('No hay suscripciones push para este usuario');
      }

      // Verificar preferencias de comunicación
      const preferences = await CommunicationPreference.findOne({ where: { user_id: userId } }) || {
        methods: ['email'], // Valor por defecto
        categories: { general: true }
      };
      if (!preferences.methods.includes('push') || !preferences.categories[category]) {
        loggerUtils.logUserActivity(userId, 'skip_push', `Notificación ${category} omitida por preferencias para ${userId}`);
        return { success: false, message: 'Notificación no enviada por preferencias' };
      }

      const payload = {
        webpush: {
          notification: {
            title,
            body: message,
            icon: '/assets/icon.png',
          },
        },
      };

      for (const subscription of subscriptions) {
        const token = subscription.endpoint.split('/').pop(); // Extraer el token FCM
        loggerUtils.logUserActivity(
          userId,
          'push_debug',
          `Enviando push - token: ${token}, title: ${title}`
        );

        try {
          const response = await admin.messaging().send({ ...payload, token });
          loggerUtils.logUserActivity(userId, 'push_sent', `Notificación enviada exitosamente: ${response}`);
        } catch (sendError) {
          loggerUtils.logCriticalError(sendError, `Fallo al enviar push al token: ${token}`);
          throw sendError;
        }
      }

      // Registrar en NotificationLog con expires_at
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expira en 24 horas
      await NotificationLog.create({
        user_id: userId,
        type: 'push',
        title,
        message,
        category, // Añadimos la categoría
        status: 'sent',
        sent_at: new Date(),
        expires_at: expiresAt,
        seen: false
      });

      return { success: true, message: 'Notificación push enviada' };
    } catch (error) {
      await NotificationLog.create({
        user_id: userId,
        type: 'push',
        title,
        message,
        category: 'general',
        status: 'failed',
        error_message: error.message,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        seen: false
      });
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al enviar notificación push: ${error.message}`);
    }
  }

  async notifyStock(userId, title, message) {
    const { User, CommunicationPreference } = require('../models/Associations');

    try {
      const user = await User.findOne({
        where: { user_id: userId, user_type: 'administrador' },
        include: [{ model: CommunicationPreference }]
      });

      if (!user) {
        loggerUtils.logUserActivity(userId, 'not_admin', `Usuario ${userId} no es administrador, no se envía notificación de stock`);
        return;
      }

      const preferences = user.CommunicationPreference || {
        methods: ['email'],
        categories: { stock_alerts: true }
      };

      if (preferences.categories.stock_alerts) {
        if (preferences.methods.includes('push')) {
          await this.sendPushNotification(userId, title, message, 'stock_alerts');
        }
        if (preferences.methods.includes('email')) {
          await this.emailService.notifyStockEmail(user.email, title, message);
        }
      } else {
        loggerUtils.logUserActivity(userId, 'skip_stock_notification', `Notificación de stock omitida por preferencias para ${userId}`);
      }
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock por push: ${error.message}`);
    }
  }
}

module.exports = NotificationService;