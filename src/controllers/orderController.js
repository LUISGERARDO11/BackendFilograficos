const { body, param, query, validationResult } = require('express-validator');
const OrderService = require('../services/orderService');
const loggerUtils = require('../utils/loggerUtils');

// Crear una orden a partir del carrito del usuario
exports.createOrder = [
  // Validaciones
  body('address_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El ID de la dirección debe ser un número entero positivo'),
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

      const { address_id, payment_method, coupon_code } = req.body;
      const orderService = new OrderService();
      const { order, payment, paymentInstructions } = await orderService.createOrder(user_id, {
        address_id,
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
          total_urgent_cost: order.total_urgent_cost || 0.00,
          estimated_delivery_date: order.estimated_delivery_date,
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

// Obtener los detalles de un pedido por ID
exports.getOrderById = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El ID del pedido debe ser un número entero positivo'),

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

      loggerUtils.logUserActivity(user_id, 'get_order_details', `Detalles del pedido obtenidos: ID ${orderId}`);

      res.status(200).json({
        success: true,
        message: 'Detalles del pedido obtenidos exitosamente',
        data: orderDetails
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      if (error.message === 'Orden no encontrada o acceso denegado') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al obtener los detalles del pedido',
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

  // Validar dateFilter (aceptar año, fecha única o rango de fechas)
  query('dateFilter')
    .optional()
    .custom((value) => {
      if (!value) return true; // Permitir valor vacío
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      const parts = value.split(',');
      if (parts.length === 1) {
        // Validar como año de 4 dígitos o fecha única en formato YYYY-MM-DD
        if (/^\d{4}$/.test(value)) {
          const year = parseInt(value);
          return year >= 1000 && year <= 9999;
        } else if (dateRegex.test(value)) {
          const date = new Date(value);
          return !isNaN(date.getTime());
        }
        throw new Error('El filtro de fecha debe ser un año válido (número de 4 dígitos) o una fecha en formato YYYY-MM-DD');
      } else if (parts.length === 2) {
        // Validar como rango de fechas (YYYY-MM-DD,YYYY-MM-DD)
        const [startDate, endDate] = parts;
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
      throw new Error('El filtro de fecha debe ser un año válido (número de 4 dígitos), una fecha en formato YYYY-MM-DD o un rango en formato YYYY-MM-DD,YYYY-MM-DD');
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
      const dateFilter = req.query.dateFilter || '';

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

// Obtener un resumen de las ordenes para el administrador
exports.getOrderSummary = [
  async (req, res) => {
    //const adminId = req.user.user_id;

    try {
      const orderService = new OrderService();
      const summary = await orderService.getOrderSummary();

      //loggerUtils.logUserActivity(adminId, 'get_order_summary', 'Resumen de órdenes obtenido por admin');

      res.status(200).json({
        success: true,
        message: 'Resumen de órdenes obtenido exitosamente',
        data: summary
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener el resumen de órdenes',
        error: error.message
      });
    }
  }
];


exports.getOrdersByDateForAdmin = [
  query('date')
    .notEmpty()
    .withMessage('La fecha es obligatoria')
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage('La fecha debe estar en formato YYYY-MM-DD'),
  query('dateField')
    .notEmpty()
    .withMessage('El campo de fecha es obligatorio')
    .isIn(['delivery', 'creation'])
    .withMessage('El campo de fecha debe ser uno de: delivery, creation'),

  async (req, res) => {
    //const adminId = req.user.user_id;
    const errors = validationResult(req);

    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const { date, dateField } = req.query;
      const orderService = new OrderService();
      //const orders = await orderService.getOrdersByDateForAdmin(date, dateField, adminId);
      const orders = await orderService.getOrdersByDateForAdmin(date, dateField);

      //loggerUtils.logUserActivity(adminId, 'get_orders_by_date_admin', `Órdenes obtenidas para la fecha ${date}, campo: ${dateField}`);

      res.status(200).json({
        success: true,
        message: 'Órdenes obtenidas exitosamente',
        data: orders,
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener órdenes por fecha',
        error: error.message,
      });
    }
  }
];

// Obtener todas las órdenes para administradores
exports.getOrdersForAdmin = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),
  query('searchTerm').optional().isString().trim().withMessage('El término de búsqueda debe ser una cadena'),
  query('statusFilter').optional().isIn(['all', 'pending', 'processing', 'shipped', 'delivered']).withMessage('El filtro de estado debe ser uno de: all, pending, processing, shipped, delivered'),
  query('dateFilter').optional().custom((value) => {
    if (!value) return true;
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const parts = value.split(',');
    if (parts.length === 1) {
      if (/^\d{4}$/.test(value)) {
        const year = parseInt(value);
        return year >= 1000 && year <= 9999;
      } else if (dateRegex.test(value)) {
        const date = new Date(value);
        return !isNaN(date.getTime());
      }
      throw new Error('El filtro de fecha debe ser un año válido (número de 4 dígitos) o una fecha en formato YYYY-MM-DD');
    } else if (parts.length === 2) {
      const [startDate, endDate] = parts;
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
    throw new Error('El filtro de fecha debe ser un año válido (número de 4 dígitos), una fecha en formato YYYY-MM-DD o un rango en formato YYYY-MM-DD,YYYY-MM-DD');
  }),
  query('dateField').optional().isIn(['delivery', 'creation']).withMessage('El campo de fecha debe ser uno de: delivery, creation'),
  query('paymentMethod').optional().isIn(['bank_transfer_oxxo', 'bank_transfer_bbva', 'bank_transfer']).withMessage('El método de pago debe ser válido'),
  query('deliveryOption').optional().isIn(['home_delivery', 'pickup_point', 'store_pickup']).withMessage('La opción de entrega debe ser válida'),
  query('minTotal').optional().isFloat({ min: 0 }).withMessage('El total mínimo debe ser un número positivo'),
  query('maxTotal').optional().isFloat({ min: 0 }).withMessage('El total máximo debe ser un número positivo'),
  query('isUrgent').optional().isBoolean().withMessage('El filtro de urgencia debe ser un booleano'),

  async (req, res) => {
    //const adminId = req.user.user_id;
    const errors = validationResult(req);

    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;
      const searchTerm = req.query.searchTerm || '';
      const statusFilter = req.query.statusFilter || 'all';
      const dateFilter = req.query.dateFilter || '';
      const dateField = req.query.dateField || 'delivery';
      const paymentMethod = req.query.paymentMethod || '';
      const deliveryOption = req.query.deliveryOption || '';
      const minTotal = req.query.minTotal ? parseFloat(req.query.minTotal) : null;
      const maxTotal = req.query.maxTotal ? parseFloat(req.query.maxTotal) : null;
      const isUrgent = req.query.isUrgent ? req.query.isUrgent === 'true' : null;

      const orderService = new OrderService();
      const result = await orderService.getOrdersForAdmin(
        page,
        pageSize,
        searchTerm,
        statusFilter,
        dateFilter,
        dateField,
        paymentMethod,
        deliveryOption,
        minTotal,
        maxTotal,
        isUrgent
      );

      if (result.pagination.totalOrders > 1000) {
        return res.status(400).json({
          success: false,
          message: 'Demasiadas órdenes en el rango seleccionado. Por favor, aplica filtros más específicos o reduce el rango de fechas.',
        });
      }

      //loggerUtils.logUserActivity(adminId, 'get_orders_admin', `Lista de órdenes obtenida por admin: página ${page}, búsqueda: ${searchTerm}, estado: ${statusFilter}, fecha: ${dateFilter || 'ninguno'}, campo: ${dateField}, método de pago: ${paymentMethod || 'ninguno'}, opción de entrega: ${deliveryOption || 'ninguna'}, total mínimo: ${minTotal || 'ninguno'}, total máximo: ${maxTotal || 'ninguno'}, urgente: ${isUrgent !== null ? isUrgent : 'ninguno'}`);

      res.status(200).json({
        success: true,
        message: 'Órdenes obtenidas exitosamente',
        data: result,
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las órdenes para administradores',
        error: error.message,
      });
    }
  },
];

// Obtener detalles de una orden por ID para administradores
exports.getOrderDetailsByIdForAdmin = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El ID de la orden debe ser un número entero positivo'),

  async (req, res) => {
    //const adminId = req.user.user_id;
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
      const orderDetails = await orderService.getOrderDetailsByIdForAdmin(orderId);

      //loggerUtils.logUserActivity(adminId, 'get_order_details_admin', `Detalles de la orden obtenidos por admin: ID ${orderId}`);

      res.status(200).json({
        success: true,
        message: 'Detalles de la orden obtenidos exitosamente',
        data: orderDetails
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      if (error.message === 'Orden no encontrada') {
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

// Actualizar el estado de una orden
exports.updateOrderStatus = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El ID de la orden debe ser un número entero positivo'),
  body('newStatus')
    .notEmpty()
    .withMessage('El nuevo estado es obligatorio')
    .isIn(['pending', 'processing', 'shipped', 'delivered'])
    .withMessage('El nuevo estado debe ser uno de: pending, processing, shipped, delivered'),

  async (req, res) => {
    //const adminId = req.user.user_id;
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
      const { newStatus } = req.body;
      const orderService = new OrderService();
      //const updatedOrder = await orderService.updateOrderStatus(orderId, newStatus, adminId);
      const updatedOrder = await orderService.updateOrderStatus(orderId, newStatus);

      //loggerUtils.logUserActivity(adminId, 'update_order_status', `Estado de la orden actualizado por admin: ID ${orderId}, nuevo estado: ${newStatus}`);

      res.status(200).json({
        success: true,
        message: 'Estado de la orden actualizado exitosamente',
        data: updatedOrder
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      if (error.message === 'Orden no encontrada' || error.message === 'Estado de orden inválido' || error.message === 'Usuario administrador no válido') {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      res.status(500).json({
        success: false,
        message: 'Error al actualizar el estado de la orden',
        error: error.message
      });
    }
  }
];