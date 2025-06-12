const { body, validationResult } = require('express-validator');
const OrderService = require('../services/orderService');
const loggerUtils = require('../utils/loggerUtils');

// Crear una orden a partir del carrito del usuario
exports.createOrder = [
  body('address_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El ID de la dirección debe ser un número entero positivo'),
  body('is_urgent')
    .optional()
    .isBoolean()
    .withMessage('El valor de pedido urgente debe ser un booleano'),
  body('payment_method')
    .notEmpty()
    .withMessage('El método de pago es obligatorio')
    .isIn(['bank_transfer_oxxo', 'bank_transfer_bbva', 'bank_transfer'])
    .withMessage('Método de pago no válido'),
  body('coupon_code')
    .optional()
    .isString()
    .trim()
    .withMessage('El código de cupón debe ser una cadena de texto'),

  async (req, res) => {
    const user_id = req.user.user_id; // Obtenido de authMiddleware
    const errors = validationResult(req);

    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array()
        });
      }

      const { address_id, is_urgent, payment_method, coupon_code } = req.body;
      const orderService = new OrderService();
      const { order, payment, paymentInstructions } = await orderService.createOrder(user_id, {
        address_id,
        is_urgent: is_urgent || false,
        payment_method,
        coupon_code
      });

      loggerUtils.logUserActivity(user_id, 'create_order', `Orden creada: ID ${order.order_id}`);

      res.status(201).json({
        success: true,
        message: 'Orden creada exitosamente',
        data: {
          order_id: order.order_id,
          total: order.total,
          payment_instructions: paymentInstructions,
          status: order.order_status
        }
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al crear la orden',
        error: error.message
      });
    }
  }
];