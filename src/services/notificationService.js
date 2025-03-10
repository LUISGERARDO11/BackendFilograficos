const webPush = require('web-push');
const webPushConfig = require('../config/notificationConfig');
const loggerUtils = require('../utils/loggerUtils');

class NotificationService {
  constructor() {
    loggerUtils.logUserActivity(null, 'vapid_config', `Configurando VAPID - subject: ${webPushConfig.vapidDetails.subject}, publicKey: ${webPushConfig.vapidDetails.publicKey.substring(0, 10)}...`);
    webPush.setVapidDetails(
      webPushConfig.vapidDetails.subject,
      webPushConfig.vapidDetails.publicKey,
      webPushConfig.vapidDetails.privateKey
    );
  }

  async saveSubscription(userId, subscriptionData) {
    const { PushSubscription } = require('../models/Associations');
    const { endpoint, keys } = subscriptionData;

    try {
      const p256dhBuffer = Buffer.from(keys.p256dh, 'base64');
      if (p256dhBuffer.length !== 65) {
        throw new Error(`La clave p256dh debe ser de 65 bytes, pero tiene ${p256dhBuffer.length} bytes`);
      }

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

  async sendPushNotification(userId, title, message) {
    const { PushSubscription, NotificationLog } = require('../models/Associations');

    try {
      const subscriptions = await PushSubscription.findAll({
        where: { user_id: userId },
      });

      if (!subscriptions.length) {
        throw new Error('No hay suscripciones push para este usuario');
      }

      const payload = JSON.stringify({ title, body: message });

      for (const subscription of subscriptions) {
        const p256dhBuffer = Buffer.from(subscription.p256dh, 'base64');
        loggerUtils.logUserActivity(
          userId,
          'push_debug',
          `Enviando push - endpoint: ${subscription.endpoint}, p256dh: ${subscription.p256dh}, longitud: ${p256dhBuffer.length} bytes, auth: ${subscription.auth}`
        );

        if (p256dhBuffer.length !== 65) {
          throw new Error(`La clave p256dh debe ser de 65 bytes, pero tiene ${p256dhBuffer.length} bytes`);
        }

        const pushSubscription = {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth,
          },
        };

        try {
          await webPush.sendNotification(pushSubscription, payload);
          loggerUtils.logUserActivity(userId, 'push_sent', `Notificación enviada exitosamente al endpoint: ${subscription.endpoint}`);
        } catch (sendError) {
          loggerUtils.logCriticalError(sendError, `Fallo al enviar push al endpoint: ${subscription.endpoint}`);
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