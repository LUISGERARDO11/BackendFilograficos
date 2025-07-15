// controllers/paymentController.js
const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    const { type, data } = req.body;

    if (type === 'payment') {
      const paymentId = data.id;
      const payment = await mercadopago.payment.get(paymentId);

      // Paso 1: Validación previa del preference_id
      const preferenceId = payment.body.preference_id;
      if (!preferenceId) {
        loggerUtils.logCriticalError(new Error(`preference_id no encontrado en el payment ${paymentId}`));
        return res.status(400).json({ success: false, message: 'preference_id no encontrado' });
      }

      // Paso 2: Usa preferenceId ya validado en la consulta
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

    return res.status(200).json({ success: true, message: 'Notificación recibida' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
  }
};