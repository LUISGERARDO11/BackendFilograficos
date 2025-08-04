/* The NotificationManager class handles notifications for out-of-stock, low-stock products, and order-related notifications by notifying administrators and users. Emails are sent always, while push notifications respect communication preferences. */
const NotificationService = require('./notificationService');
const EmailService = require('./emailService');
const loggerUtils = require('../utils/loggerUtils');
const ejs = require('ejs');
const moment = require('moment-timezone');
const orderUtils = require('../utils/orderUtils');
const async = require('async');

class NotificationManager {
  constructor() {
    this.emailService = new EmailService();
    this.notificationService = new NotificationService();
  }

  /**
   * Notifica a los administradores sobre una nueva orden creada.
   * @param {Object} order - Datos de la orden creada.
   * @param {Object} user - Datos del usuario que creó la orden.
   * @param {Array} orderDetails - Detalles de los ítems de la orden.
   * @param {Object} payment - Datos del pago asociado a la orden.
   */
  async notifyNewOrder(order, user, orderDetails, payment) {
    try {
      const template = await this.emailService.getEmailTemplate('new_order_admin');
      const data = {
        order_id: order.order_id,
        user_name: user.name || 'Usuario desconocido',
        user_id: order.user_id,
        total: orderUtils.formatCurrency(order.total),
        is_urgent: orderDetails.some(detail => detail.is_urgent),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        delivery_option: order.delivery_option ? order.delivery_option.replace('_', ' ').toUpperCase() : 'No especificada',
        discount: orderUtils.formatCurrency(order.discount || 0),
        shipping_cost: orderUtils.formatCurrency(order.shipping_cost || 0),
        payment_method: order.payment_method ? order.payment_method.replace('_', ' ').toUpperCase() : 'No especificado',
        payment_status: payment?.status || 'pending',
        transaction_id: payment?.transaction_id || 'No disponible',
        order_details: orderDetails.map(detail => ({
          product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
          sku: detail.ProductVariant?.sku || 'N/A',
          quantity: detail.quantity,
          unit_price: orderUtils.formatCurrency(detail.unit_price),
          subtotal: orderUtils.formatCurrency(detail.subtotal),
          discount_applied: orderUtils.formatCurrency(detail.discount_applied || 0),
          additional_cost: orderUtils.formatCurrency(detail.additional_cost || 0),
          is_urgent: detail.is_urgent
        }))
      };

      const htmlContent = ejs.render(template.html_content, data);
      const textContent = ejs.render(template.text_content, data);
      const subject = ejs.render(template.subject, data);

      await this.notifyAdmins('new_order_admin', subject, htmlContent, textContent, data);
      loggerUtils.logUserActivity(null, 'notify_new_order', `Notificación enviada: Nueva orden ${order.order_id}`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar nueva orden: ${error.message}`);
    }
  }

  /**
   * Notifica al cliente sobre un cambio en el estado de su orden.
   * @param {Object} order - Datos de la orden actualizada.
   * @param {Object} user - Datos del usuario asociado a la orden.
   * @param {Array} orderDetails - Detalles de los ítems de la orden.
   * @param {Object} payment - Datos del pago asociado a la orden.
   */
  async notifyOrderStatusChange(order, user, orderDetails, payment) {
    try {
      const template = await this.emailService.getEmailTemplate('order_status_change');
      const statusTranslations = {
        pending: 'Pendiente',
        processing: 'En proceso',
        shipped: 'Enviado',
        delivered: 'Entregado'
      };
      const translatedStatus = statusTranslations[order.order_status.toLowerCase()] || order.order_status;

      const data = {
        order_id: order.order_id,
        user_name: user.name || 'Usuario desconocido',
        new_status: translatedStatus,
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        delivery_option: order.delivery_option ? order.delivery_option.replace('_', ' ').toUpperCase() : 'No especificada',
        total: orderUtils.formatCurrency(order.total),
        discount: orderUtils.formatCurrency(order.discount || 0),
        shipping_cost: orderUtils.formatCurrency(order.shipping_cost || 0),
        payment_method: order.payment_method ? order.payment_method.replace('_', ' ').toUpperCase() : 'No especificado',
        payment_status: payment?.status || 'pending',
        order_details: orderDetails.map(detail => ({
          product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
          quantity: detail.quantity,
          unit_price: orderUtils.formatCurrency(detail.unit_price),
          subtotal: orderUtils.formatCurrency(detail.subtotal),
          discount_applied: orderUtils.formatCurrency(detail.discount_applied || 0),
          is_urgent: detail.is_urgent ? 'Sí' : 'No'
        })),
        order_details_url: `${process.env.URL_FRONTEND_ORDER_DETAIL}/${order.order_id}`
      };

      const htmlContent = ejs.render(template.html_content, data);
      const textContent = ejs.render(template.text_content, data);
      const subject = ejs.render(template.subject, data);

      await this.emailService.sendGenericEmail(user.email, subject, htmlContent, textContent);
      loggerUtils.logUserActivity(user.user_id, 'notify_order_status_change', `Notificación enviada: Cambio de estado para orden ${order.order_id}`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar cambio de estado: ${error.message}`);
    }
  }

  async notifyOutOfStock(variantId, productName) {
    try {
      await this.notifyAdmins('out_of_stock', null, null, null, { variantId, productName, stock: 0 });
      loggerUtils.logUserActivity(null, 'notify_out_of_stock', `Notificación enviada: ${productName} agotado`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock agotado: ${error.message}`);
    }
  }

  async notifyLowStock(variantId, productName, stock) {
    try {
      await this.notifyAdmins('low_stock', null, null, null, { variantId, productName, stock });
      loggerUtils.logUserActivity(null, 'notify_low_stock', `Notificación enviada: ${productName} con stock bajo (${stock})`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al notificar stock bajo: ${error.message}`);
    }
  }

  async notifyAdmins(type, subject, htmlContent, textContent, data) {
    const { User, CommunicationPreference } = require('../models/Associations');

    if (!User || typeof User.findAll !== 'function') {
        loggerUtils.logCriticalError(new Error('Modelo User no está definido en notifyAdmins'));
        throw new Error('Modelo User no está definido o no tiene el método findAll');
    }

    const admins = await User.findAll({
        where: { user_type: 'administrador' },
        include: [{ model: CommunicationPreference }],
        attributes: ['user_id', 'email']
    });

    if (!admins.length) {
        loggerUtils.logUserActivity(null, 'no_admins_found', 'No hay administradores para notificar');
        return;
    }

    const notifiedUsers = new Set();

    for (const admin of admins) {
        if (notifiedUsers.has(admin.user_id)) continue;
        notifiedUsers.add(admin.user_id);

        const preferences = admin.CommunicationPreference || {
            methods: ['email'],
            categories: {
                special_offers: false,
                event_reminders: false,
                news_updates: false,
                order_updates: false,
                urgent_orders: false,
                design_reviews: false,
                stock_alerts: false,
                order_notifications: false
            }
        };

        if (type === 'out_of_stock' || type === 'low_stock') {
            if (!preferences.categories.stock_alerts) {
                loggerUtils.logUserActivity(admin.user_id, 'skip_notification', 
                    `Notificación de stock omitida para ${admin.user_id} por preferencias`);
                continue;
            }
            const title = type === 'out_of_stock'
                ? `¡Alerta! ${data.productName} se ha agotado`
                : `¡Advertencia! ${data.productName} tiene stock bajo (${data.stock} unidades)`;
            const message = type === 'out_of_stock'
                ? `La variante ${data.productName} (ID: ${data.variantId}) se ha quedado sin stock.`
                : `La variante ${data.productName} (ID: ${data.variantId}) tiene solo ${data.stock} unidades restantes.`;

            if (preferences.methods.includes('email')) {
                await this.emailService.notifyStockEmail(admin.email, title, message);
            }
            if (preferences.methods.includes('push')) {
                await this.notificationService.notifyStock(admin.user_id, title, message);
            }
        } else if (type === 'new_order_admin') {
            await this.emailService.sendGenericEmail(admin.email, subject, htmlContent, textContent);
            if (preferences.methods.includes('push') && preferences.categories.order_notifications) {
                const title = `Nueva Orden #${data.order_id}`;
                const message = `Se ha creado una nueva orden de ${data.user_name} (Total: ${data.total})`;
                await this.notificationService.notifyStock(admin.user_id, title, message);
            }
        }
    }
  }

  async notifyCouponDistribution(couponCode, users) {
    try {
      const queue = async.queue(async (user, callback) => {
        try {
          const result = await this.emailService.sendCouponEmail(user.email, couponCode);
          if (result.success) {
            loggerUtils.logUserActivity(user.user_id || null, 'send_coupon_email', `Correo de cupón enviado a ${user.email}`);
          } else {
            loggerUtils.logUserActivity(user.user_id || null, 'send_coupon_email_failed', `Fallo al enviar correo de cupón a ${user.email}: ${result.error}`);
          }
        } catch (error) {
          loggerUtils.logCriticalError(error, `Error al enviar correo de cupón a ${user.email}`);
        }
        callback();
      }, 10); // Concurrencia limitada a 10 correos simultáneos

      users.forEach(user => {
        queue.push(user);
      });

      await queue.drain();
      loggerUtils.logUserActivity(null, 'notify_coupon_distribution', `Distribución de cupones completada para ${users.length} usuarios con código ${couponCode}`);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al distribuir cupones: ${error.message}`);
    }
  }
}

module.exports = NotificationManager;