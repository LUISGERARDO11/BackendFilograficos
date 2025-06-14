const {  body, param, query, validationResult } = require('express-validator');
const OrderService = require('../services/orderService');
const loggerUtils = require('../utils/loggerUtils');

// Crear una orden a partir del carrito del usuario
exports.createOrder = [
  // Validaciones existentes
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

// Obtener los detalles de una orden por ID
exports.getOrderById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El ID de la orden debe ser un número entero positivo'),

  async (req, res) => {
    const user_id = req.user.user_id;
    const errors = validationResult(req);

    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array()
        });
      }

      const orderId = parseInt(req.params.id);
      const orderService = new OrderService();
      const orderDetails = await orderService.getOrderById(user_id, orderId);

      loggerUtils.logUserActivity(user_id, 'get_order_details', `Detalles de la orden obtenidos: ID ${orderId}`);

      res.status(200).json({
        success: true,
        message: 'Detalles de la orden obtenidos exitosamente',
        data: orderDetails
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      if (error.message === 'Orden no encontrada' || error.message === 'Acceso denegado') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al obtener los detalles de la orden',
        error: error.message
      });
    }
  }
];

// Obtener todas las órdenes del usuario
exports.getOrders = [
  // Validar page
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),

  // Validar pageSize
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),

  // Validar searchTerm
  query('searchTerm')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('El término de búsqueda debe ser una cadena entre 1 y 100 caracteres'),

  // Validar dateFilter (aceptar año o rango de fechas)
  query('dateFilter')
    .optional()
    .custom((value) => {
      if (!value) return true; // Permitir valor vacío
      const parts = value.split(',');
      if (parts.length === 1) {
        // Validar como año de 4 dígitos
        return /^\d{4}$/.test(value) && parseInt(value) >= 1000 && parseInt(value) <= 9999;
      } else if (parts.length === 2) {
        // Validar como rango de fechas (YYYY-MM-DD,YYYY-MM-DD)
        const [startDate, endDate] = parts;
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
          throw new Error('El rango de fechas debe estar en formato YYYY-MM-DD,YYYY-MM-DD');
        }
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
          throw new Error('El rango de fechas no es válido');
        }
        return true;
      }
      throw new Error('El filtro de fecha debe ser un año válido (número de 4 dígitos) o un rango en formato YYYY-MM-DD,YYYY-MM-DD');
    }),

  async (req, res) => {
    const user_id = req.user.user_id;
    const errors = validationResult(req);

    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array()
        });
      }

      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 10;
      const searchTerm = req.query.searchTerm || '';
      const dateFilter = req.query.dateFilter || ''; // Puede ser año o rango

      const orderService = new OrderService();
      const orders = await orderService.getOrders(user_id, page, pageSize, searchTerm, dateFilter);

      loggerUtils.logUserActivity(user_id, 'get_orders', `Lista de órdenes obtenida: página ${page}, búsqueda: ${searchTerm}, filtro: ${dateFilter || 'ninguno'}`);

      res.status(200).json({
        success: true,
        message: 'Órdenes obtenidas exitosamente',
        data: orders
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las órdenes',
        error: error.message
      });
    }
  }
];