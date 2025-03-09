const notificationService = require('./notificationService');
const EmailService = require('./emailService'); // Importar la clase
const loggerUtils = require('../utils/loggerUtils');

class NotificationManager {
  constructor() {
    this.emailService = new EmailService(); // Instanciar aquí
  }

  async notifyOutOfStock(variantId, productName) {
    try {
      await this.notifyAdmins('out_of_stock', variantId, productName, 0);
      loggerUtils.logUserActivity(null, 'notify_out_of_stock', `Notificación enviada: ${productName} agotado`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock agotado: ${error.message}`);
    }
  }

  async notifyLowStock(variantId, productName, stock) {
    try {
      await this.notifyAdmins('low_stock', variantId, productName, stock);
      loggerUtils.logUserActivity(null, 'notify_low_stock', `Notificación enviada: ${productName} con stock bajo (${stock})`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock bajo: ${error.message}`);
    }
  }

  async notifyAdmins(stockStatus, variantId, productName, stock) {
    const { User } = require('../models/Associations');

    if (!User || typeof User.findAll !== 'function') {
      loggerUtils.logCriticalError(new Error('Modelo User no está definido en notifyAdmins'));
      throw new Error('Modelo User no está definido o no tiene el método findAll');
    }

    const admins = await User.findAll({
      where: { user_type: 'administrador' },
      attributes: ['user_id', 'email'],
    });

    if (!admins.length) {
      loggerUtils.logUserActivity(null, 'no_admins_found', 'No hay administradores para notificar');
      return;
    }

    const notifiedUsers = new Set();

    for (const admin of admins) {
      if (notifiedUsers.has(admin.user_id)) continue;
      notifiedUsers.add(admin.user_id);

      const title = stockStatus === 'out_of_stock'
        ? `¡Alerta! ${productName} se ha agotado`
        : `¡Advertencia! ${productName} tiene stock bajo (${stock} unidades)`;
      const message = stockStatus === 'out_of_stock'
        ? `La variante ${productName} (ID: ${variantId}) se ha quedado sin stock.`
        : `La variante ${productName} (ID: ${variantId}) tiene solo ${stock} unidades restantes.`;

      await this.emailService.notifyStockEmail(admin.email, title, message); // Usar la instancia
      await notificationService.notifyStock(admin.user_id, title, message);
    }
  }
}

module.exports = NotificationManager; // Exportar la clase