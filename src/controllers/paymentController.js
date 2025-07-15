// controllers/paymentController.js
const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    const { type, data, topic, id } = req.body;

    // Manejo de notificaciones de tipo 'payment'
    if (type === 'payment' || topic === 'payment') {
      const paymentId = data?.id || id;
      if (!paymentId) {
        loggerUtils.logCriticalError(new Error('paymentId no encontrado en la notificación'));
        return res.status(400).json({ success: false, message: 'paymentId no encontrado' });
      }

      const payment = await mercadopago.payment.get(paymentId);
      let preferenceId = payment.body.preference_id;

      // Si no se encuentra preference_id, intentamos obtenerlo desde merchant_order
      if (!preferenceId && payment.body.order?.id) {
        try {
          const merchantOrder = await mercadopago.merchant_orders.get(payment.body.order.id);
          preferenceId = merchantOrder.body.preference_id;
        } catch (error) {
          loggerUtils.logCriticalError(new Error(`Error al obtener merchant_order para payment ${paymentId}: ${error.message}`));
        }
      }

      // Validación final del preference_id
      if (!preferenceId) {
        // Como respaldo, intentamos buscar por transaction_id
        const localPaymentByTransaction = await Payment.findOne({
          where: { transaction_id: paymentId },
        });

        if (localPaymentByTransaction) {
          preferenceId = localPaymentByTransaction.preference_id;
        } else {
          loggerUtils.logCriticalError(new Error(`preference_id no encontrado en el payment ${paymentId}`));
          return res.status(400).json({ success: false, message: 'preference_id no encontrado' });
        }
      }

      // Buscar el pago local con el preference_id
      const localPayment = await Payment.findOne({
        where: { preference_id: preferenceId },
      });

      if (!localPayment) {
        loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${preferenceId}`));
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

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
          newStatus = 'pending';
          break;
        default:
          newStatus = 'pending';
      }

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

    // Manejo de notificaciones de tipo 'merchant_order'
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

      // Buscar el pago local con el preference_id
      const localPayment = await Payment.findOne({
        where: { preference_id: preferenceId },
      });

      if (!localPayment) {
        loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${preferenceId}`));
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      // Opcional: Actualizar estado basado en merchant_order
      // Por ahora, confirmamos la recepción de la notificación
      return res.status(200).json({ success: true, message: 'Notificación de merchant_order procesada' });
    }

    return res.status(200).json({ success: true, message: 'Notificación recibida' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
  }
};