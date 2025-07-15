const { validationResult, param, query } = require('express-validator');
const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');

// Configura la clave de acceso a Mercado Pago (ya debe estar en tu entorno)
mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

exports.handleMercadoPagoWebhook = async (req, res) => {
  try {
    const { action, type, data } = req.body;

    if (!data?.id || type !== 'payment') {
      return res.status(400).json({ success: false, message: 'Datos de webhook inválidos' });
    }

    // Obtener datos del pago desde MercadoPago
    const paymentInfo = await mercadopago.payment.findById(data.id);
    const paymentData = paymentInfo.body;

    const {
      id: transaction_id,
      status,
      external_reference,
      transaction_details,
      preference_id
    } = paymentData;

    // Buscar el registro de Payment por preference_id
    const paymentRecord = await Payment.findOne({ where: { preference_id } });

    if (!paymentRecord) {
      return res.status(404).json({ success: false, message: 'Registro de pago no encontrado' });
    }

    // Actualizar estado del pago
    paymentRecord.status = status;
    paymentRecord.transaction_id = String(transaction_id);
    paymentRecord.receipt_url = transaction_details?.external_resource_url || null;
    paymentRecord.attempts += 1;

    await paymentRecord.save();

    // Actualizar orden si el pago fue aprobado
    if (status === 'approved') {
      await Order.update(
        { payment_status: 'validated' },
        { where: { order_id: external_reference } }
      );
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error('Error en el webhook de Mercado Pago:', error);
    return res.status(500).json({ success: false, message: 'Error procesando el webhook' });
  }
};
