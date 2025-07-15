// controllers/paymentController.js
const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

exports.handleMercadoPagoWebhook = async (req, res) => {
  console.log('Webhook recibido a las:', new Date().toISOString(), 'cuerpo:', req.body);
  try {
    loggerUtils.logUserActivity(null, 'webhook_received', `Webhook recibido: ${JSON.stringify(req.body)}`);
    let { type, data } = req.body;
    if (!Array.isArray(req.body)) {
      type = req.body.type;
      data = req.body.data;
    }
    if (type === 'payment') {
      console.log('Procesando pago, paymentId:', data.id);
      const payment = await mercadopago.payment.get(data.id);
      console.log('Respuesta de Mercado Pago:', payment.body);

      const localPayment = await Payment.findOne({
        where: { preference_id: payment.body.preference_id },
      });

      if (!localPayment) {
        loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${payment.body.preference_id}`));
        return res.status(404).json({ success: false, message: 'Pago no encontrado' });
      }

      let newStatus = 'pending';
      switch (payment.body.status) {
        case 'approved': newStatus = 'validated'; break;
        case 'rejected': case 'cancelled': newStatus = 'failed'; break;
        case 'pending': case 'in_process': newStatus = 'pending'; break;
      }

      await localPayment.update({
        status: newStatus,
        transaction_id: data.id,
        updated_at: new Date(),
      });

      await Order.update(
        { payment_status: newStatus },
        { where: { order_id: localPayment.order_id } }
      );

      loggerUtils.logUserActivity(
        localPayment.order_id,
        'payment_status_update',
        `Pago actualizado: ID ${data.id}, estado: ${newStatus}`
      );
    }
    res.status(200).json({ success: true, message: 'Notificación procesada' });
  } catch (error) {
    console.error('Error en webhook:', error.message, error.stack);
    loggerUtils.logCriticalError(error);
    res.status(200).json({ success: false, message: 'Error procesado' }); // Responder 200 para evitar reintentos
  }
};