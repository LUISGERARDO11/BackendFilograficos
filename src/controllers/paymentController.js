const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    const { type, topic, data, id } = req.body;

    // Compatibilidad con diferentes formatos de Webhook (tipo viejo y nuevo)
    const eventType = type || topic;
    const paymentId = data?.id || id;

    if (eventType === 'payment' && paymentId) {
      const payment = await mercadopago.payment.get(paymentId);
      let preferenceId = payment.body.preference_id;

      // Intento de obtener preference_id desde merchant_order si no viene en el payment
      if (!preferenceId && payment.body.order?.id) {
        try {
          const merchantOrder = await mercadopago.merchant_orders.get(payment.body.order.id);
          preferenceId = merchantOrder.body.preference_id;
        } catch (error) {
          loggerUtils.logCriticalError(new Error(`Error al obtener merchant_order para payment ${paymentId}: ${error.message}`));
        }
      }

      // Buscar el pago local
      let localPayment = null;

      if (preferenceId) {
        localPayment = await Payment.findOne({
          where: { preference_id: preferenceId },
        });
      }

      // Si no se encontró por preference_id, buscar por transaction_id
      if (!localPayment) {
        localPayment = await Payment.findOne({
          where: { transaction_id: String(paymentId) },
        });
      }

      if (!localPayment) {
        loggerUtils.logCriticalError(
          new Error(`Pago no encontrado. paymentId: ${paymentId}, preference_id: ${preferenceId || 'no disponible'}`)
        );
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      // Actualizar estado directamente con el status original de Mercado Pago
      const mercadoPagoStatus = payment.body.status;

      await localPayment.update({
        status: mercadoPagoStatus,
        transaction_id: String(paymentId),
        updated_at: new Date(),
      });

      await Order.update(
        { payment_status: mercadoPagoStatus },
        { where: { order_id: localPayment.order_id } }
      );

      loggerUtils.logUserActivity(
        localPayment.order_id,
        'payment_status_update',
        `Pago actualizado: ID ${paymentId}, estado: ${mercadoPagoStatus}`
      );

      return res.status(200).json({ success: true, message: 'Notificación procesada' });
    }

    if (eventType === 'merchant_order') {
      return res.status(200).json({ success: true, message: 'Notificación de merchant_order recibida (sin acción)' });
    }

    return res.status(200).json({ success: true, message: 'Notificación recibida' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
  }
};

