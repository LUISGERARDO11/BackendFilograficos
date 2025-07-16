const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');
const crypto = require('crypto');

// Validar firma del Webhook
function validateWebhookSignature(req, secretKey) {
  const signature = req.headers['x-signature'];
  if (!signature) return false;
  const [tsPart, v1Part] = signature.split(',');
  const ts = tsPart.split('=')[1];
  const v1 = v1Part.split('=')[1];
  const manifest = `id:${req.body.id};request-id:${req.headers['x-request-id']};ts:${ts};`;
  const hash = crypto.createHmac('sha256', secretKey).update(manifest).digest('hex');
  return hash === v1;
}

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    // Validar firma
    if (!validateWebhookSignature(req, process.env.MERCADO_PAGO_SECRET_KEY)) {
      loggerUtils.logCriticalError(new Error('Firma de Webhook inválida'));
      return res.status(401).json({ success: false, message: 'Firma inválida' });
    }

    // Verificar notificación duplicada
    const existingNotification = await Payment.findOne({ where: { notification_id: req.body.id } });
    if (existingNotification) {
      return res.status(200).json({ success: true, message: 'Notificación ya procesada' });
    }

    const { type, data, topic, id } = req.body;

    if (type === 'payment' || topic === 'payment') {
      const paymentId = data?.id || id;
      if (!paymentId) {
        loggerUtils.logCriticalError(new Error('paymentId no encontrado en la notificación'));
        return res.status(400).json({ success: false, message: 'paymentId no encontrado' });
      }

      const payment = await mercadopago.payment.get(paymentId);
      const localPayment = await Payment.findOne({ where: { order_id: payment.body.external_reference } });

      if (!localPayment) {
        loggerUtils.logCriticalError(
          new Error(`Pago no encontrado para paymentId: ${paymentId}, external_reference: ${payment.body.external_reference || 'no disponible'}`)
        );
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
        case 'in_mediation':
          newStatus = 'pending';
          break;
        case 'charged_back':
          newStatus = 'refunded';
          break;
        default:
          newStatus = 'pending';
      }

      await localPayment.update({
        status: newStatus,
        transaction_id: paymentId,
        notification_id: id, // Guardar ID de la notificación
        updated_at: new Date(),
      });

      await Order.update(
        { payment_status: newStatus },
        { where: { order_id: localPayment.order_id } }
      );

      loggerUtils.logUserActivity(
        localPayment.order_id,
        'payment_status_update',
        `Pago actualizado: ID ${paymentId}, estado: ${newStatus}, external_reference: ${payment.body.external_reference}`
      );

      return res.status(200).json({ success: true, message: 'Notificación procesada' });
    }

    if (type === 'merchant_order' || topic === 'merchant_order') {
      const merchantOrderId = data?.id || id;
      if (!merchantOrderId) {
        loggerUtils.logCriticalError(new Error('merchantOrderId no encontrado en la notificación'));
        return res.status(400).json({ success: false, message: 'merchantOrderId no encontrado' });
      }

      const merchantOrder = await mercadopago.merchant_orders.get(merchantOrderId);
      const localPayment = await Payment.findOne({ where: { order_id: merchantOrder.body.external_reference } });

      if (!localPayment) {
        loggerUtils.logCriticalError(
          new Error(`Pago no encontrado para merchantOrderId: ${merchantOrderId}, external_reference: ${merchantOrder.body.external_reference || 'no disponible'}`)
        );
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      await localPayment.update({ notification_id: id, updated_at: new Date() });

      return res.status(200).json({ success: true, message: 'Notificación de merchant_order procesada' });
    }

    return res.status(200).json({ success: true, message: 'Notificación recibida' });
  } catch (error) {
    loggerUtils.logCriticalError(error, `Cuerpo de la notificación: ${JSON.stringify(req.body)}`);
    return res.status(500).json({ success: false, message: 'Error al procesar la notificación' });
  }
};