const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    loggerUtils.logUserActivity(null, 'webhook_attempt', `Intento de webhook: Método=${req.method}, URL=${req.url}, Headers=${JSON.stringify(req.headers)}`);
    loggerUtils.logUserActivity(null, 'webhook_received', `Webhook recibido: ${JSON.stringify(req.body)}`);
    const { type, data } = req.body;

    if (type !== 'payment') {
      loggerUtils.logUserActivity(null, 'webhook_ignored', `Tipo de notificación no manejado: ${type}`);
      return res.status(200).json({ success: true, message: 'Notificación recibida' });
    }

    const paymentId = data.id; // ID del pago de Mercado Pago
    loggerUtils.logUserActivity(null, 'webhook_payment', `Procesando pago ID: ${paymentId}, preference_id: ${data?.preference_id || 'No proporcionado'}`);

    if (!paymentId) {
      loggerUtils.logCriticalError(new Error('ID de pago no proporcionado en la notificación'));
      return res.status(400).json({ success: false, message: 'ID de pago no proporcionado' });
    }

    let payment;
    try {
      payment = await mercadopago.payment.get(paymentId);
      loggerUtils.logUserActivity(null, 'webhook_payment_details', `Detalles del pago: ${JSON.stringify(payment.body)}`);
    } catch (error) {
      loggerUtils.logCriticalError(error, `Error al obtener detalles del pago ID: ${paymentId}`);
      return res.status(400).json({ success: false, message: 'Error al obtener detalles del pago', error: error.message });
    }

    const preferenceId = payment.body.preference_id;
    if (!preferenceId) {
      loggerUtils.logCriticalError(new Error(`No se proporcionó preference_id para el pago ID: ${paymentId}`));
      return res.status(400).json({ success: false, message: 'No se proporcionó preference_id' });
    }

    // Buscar el pago local usando el preference_id
    const localPayment = await Payment.findOne({
      where: { preference_id: preferenceId },
      include: [{ model: Order, attributes: ['user_id', 'order_id'] }]
    });

    if (!localPayment) {
      loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${preferenceId}`));
      return res.status(404).json({ success: false, message: 'Pago no encontrado' });
    }

    // Actualizar el estado basado en el status de Mercado Pago
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
      `Pago actualizado: ID ${paymentId}, estado: ${newStatus}, order_id: ${localPayment.order_id}`
    );

    return res.status(200).json({ success: true, message: 'Notificación procesada' });
  } catch (error) {
    loggerUtils.logCriticalError(error, `Error en webhook: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación', error: error.message });
  }
};