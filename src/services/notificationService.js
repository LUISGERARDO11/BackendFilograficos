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
        created_at: new Date(),
        updated_at: new Date(),
      });
  
      loggerUtils.logUserActivity(userId, 'save_subscription', `Suscripción push guardada para el usuario ${userId}`);
      return subscription;
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al guardar la suscripción: ${error.message}`);
    }
  }

  async sendPushNotification(userId, title, message) {
    const { PushSubscription, NotificationLog } = require('../models/Associations');

    try {
      const subscriptions = await PushSubscription.findAll({
        where: { user_id: userId },
      });

      if (!subscriptions.length) {
        throw new Error('No hay suscripciones push para este usuario');
      }

      const payload = {
        webpush: {
          notification: {
            title,
            body: message,
            icon: '/assets/icon.png', // Compatible con tu frontend
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

      await NotificationLog.create({
        user_id: userId,
        type: 'push',
        title,
        message,
        status: 'sent',
        sent_at: new Date(),
        created_at: new Date(),
      });

      return { success: true, message: 'Notificación push enviada' };
    } catch (error) {
      await NotificationLog.create({
        user_id: userId,
        type: 'push',
        title,
        message,
        status: 'failed',
        error_message: error.message,
        created_at: new Date(),
      });
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al enviar notificación push: ${error.message}`);
    }
  }

  async notifyStock(userId, title, message) {
    const { User } = require('../models/Associations');

    try {
      const user = await User.findOne({
        where: { user_id: userId, user_type: 'administrador' },
      });

      if (!user) {
        loggerUtils.logUserActivity(userId, 'not_admin', `Usuario ${userId} no es administrador, no se envía notificación de stock`);
        return;
      }

      await this.sendPushNotification(userId, title, message);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock por push: ${error.message}`);
    }
  }
}

module.exports = NotificationService;