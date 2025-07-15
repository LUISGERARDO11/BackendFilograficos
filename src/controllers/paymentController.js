// controllers/paymentController.js
const { Payment, Order } = require('../models/Associations');
const mercadopago = require('mercadopago');
const loggerUtils = require('../utils/loggerUtils');

mercadopago.configure({
  access_token: process.env.MERCADO_PAGO_ACCESS_TOKEN
});

exports.handleMercadoPagoWebhook = async (req, res) => {
    try {
        const { type, data } = req.body;
        loggerUtils.logUserActivity(null, 'webhook_received', `Webhook recibido: ${JSON.stringify(req.body)}`);
        if (type === 'payment') {
            const paymentId = data.id;
            const payment = await mercadopago.payment.get(paymentId);

            const localPayment = await Payment.findOne({
                where: { preference_id: payment.body.preference_id },
            });

            if (!localPayment) {
                loggerUtils.logCriticalError(new Error(`Pago no encontrado para preference_id: ${payment.body.preference_id}`));
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