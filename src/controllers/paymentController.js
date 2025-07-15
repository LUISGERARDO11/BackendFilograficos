const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    const { type, data, topic, id } = req.body;

    // Aceptar tanto `type` como `topic`
    if (type === 'payment' || topic === 'payment') {
      const paymentId = data?.id || id;
      if (!paymentId) {
        loggerUtils.logCriticalError(new Error('paymentId no encontrado en la notificación'));
        return res.status(400).json({ success: false, message: 'paymentId no encontrado' });
      }

      // Obtener pago desde Mercado Pago
      const payment = await mercadopago.payment.get(paymentId);
      let preferenceId = payment.body.preference_id || payment.body.metadata?.preference_id;

      // Backup: obtener preference_id desde merchant_order si no viene directo
      if (!preferenceId && payment.body.order?.id) {
        try {
          const merchantOrder = await mercadopago.merchant_orders.get(payment.body.order.id);
          preferenceId = merchantOrder.body.preference_id;
        } catch (error) {
          loggerUtils.logCriticalError(new Error(`Error al obtener merchant_order para payment ${paymentId}: ${error.message}`));
        }
      }

      // Buscar pago local por preference_id
      let localPayment = null;
      if (preferenceId) {
        localPayment = await Payment.findOne({
          where: { preference_id: preferenceId },
        });
      }

      // Si falla por preference_id, intentar por transaction_id
      if (!localPayment) {
        localPayment = await Payment.findOne({
          where: { transaction_id: paymentId },
        });
      }

      if (!localPayment) {
        loggerUtils.logCriticalError(
          new Error(`Pago no encontrado para paymentId: ${paymentId}, preference_id: ${preferenceId || 'no disponible'}`)
        );
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      // Mapear el estado
      let newStatus;
      switch (payment.body.status) {
        case 'approved':
          newStatus = 'validated';
          break;
        case 'rejected':
        case 'cancelled':
          newStatus = 'failed';
          break;
        case 'pending':
        case 'in_process':
        default:
          newStatus = 'pending';
      }

      // Actualizar en BD
      await localPayment.update({
        status: newStatus,
        transaction_id: paymentId,
        updated_at: new Date(),
      });

      await Order.update(
        { payment_status: newStatus },
        { where: { order_id: localPayment.order_id } }
      );

      loggerUtils.logUserActivity(
        localPayment.order_id,
        'payment_status_update',
        `Pago actualizado: ID ${paymentId}, estado: ${newStatus}`
      );

      return res.status(200).json({ success: true, message: 'Notificación procesada' });
    }

    // Notificaciones merchant_order
    if (type === 'merchant_order' || topic === 'merchant_order') {
      const merchantOrderId = data?.id || id;
      if (!merchantOrderId) {
        loggerUtils.logCriticalError(new Error('merchantOrderId no encontrado en la notificación'));
        return res.status(400).json({ success: false, message: 'merchantOrderId no encontrado' });
      }

      const merchantOrder = await mercadopago.merchant_orders.get(merchantOrderId);
      const preferenceId = merchantOrder.body.preference_id;

      if (!preferenceId) {
        loggerUtils.logCriticalError(new Error(`preference_id no encontrado en el merchant_order ${merchantOrderId}`));
        return res.status(400).json({ success: false, message: 'preference_id no encontrado' });
      }

      const localPayment = await Payment.findOne({
        where: { preference_id: preferenceId },
      });

      if (!localPayment) {
        loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${preferenceId}`));
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      return res.status(200).json({ success: true, message: 'Notificación de merchant_order procesada' });
    }

    return res.status(200).json({ success: true, message: 'Notificación recibida' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
  }
};
