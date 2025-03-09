const webPush = require('web-push');
const { PushSubscription, NotificationLog } = require('../models/Associations');
const webPushConfig = require('../config/notificationConfig');
const loggerUtils = require('../utils/loggerUtils');

class NotificationService {
  constructor() {
    webPush.setVapidDetails(
      webPushConfig.vapidDetails.subject,
      webPushConfig.vapidDetails.publicKey,
      webPushConfig.vapidDetails.privateKey
    );
  }

  // Método para guardar una suscripción push
  async saveSubscription(userId, subscriptionData) {
    const { endpoint, keys } = subscriptionData;
    try {
      const existingSubscription = await PushSubscription.findOne({
        where: { user_id: userId, endpoint },
      });

      if (existingSubscription) {
        return existingSubscription;
      }

      const subscription = await PushSubscription.create({
        user_id: userId,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
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

  // Método para enviar notificación push a un usuario
  async sendPushNotification(userId, title, message) {
    try {
      const subscriptions = await PushSubscription.findAll({
        where: { user_id: userId },
      });

      if (!subscriptions.length) {
        throw new Error('No hay suscripciones push para este usuario');
      }

      const payload = JSON.stringify({ title, body: message });

      for (const subscription of subscriptions) {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload
        );
      }

      // Registrar en el log de notificaciones
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
      throw new Error(`Error al enviar notificación push: ${error.message}`);
    }
  }
}

module.exports = new NotificationService();