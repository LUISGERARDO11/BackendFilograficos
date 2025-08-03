const { body, param, query, validationResult } = require('express-validator');
const OrderService = require('../services/orderService');
const loggerUtils = require('../utils/loggerUtils');
const { ShippingOption } = require('../models/Associations');
const mercadopago = require('../config/mercado-pago.config');

// Crear una orden a partir del carrito del usuario o un ítem único
exports.createOrder = [
  body('address_id')
    .if(body('delivery_option').equals('Entrega a Domicilio'))
    .notEmpty()
    .withMessage('La dirección es obligatoria para Entrega a Domicilio')
    .isInt({ min: 1 })
    .withMessage('El ID de la dirección debe ser un número entero positivo'),
  body('payment_method')
    .notEmpty()
    .withMessage('El método de pago es obligatorio')
    .isIn(['mercado_pago'])
    .withMessage('Método de pago no válido. Solo se acepta Mercado Pago'),
  body('coupon_code')
    .optional()
    .isString()
    .trim()
    .withMessage('El código de cupón debe ser una cadena de texto'),
  body('delivery_option')
    .notEmpty()
    .withMessage('La opción de envío es obligatoria')
    .isIn(['Entrega a Domicilio', 'Puntos de Entrega', 'Recoger en Tienda'])
    .withMessage('Opción de envío no válida'),
  body('item')
    .optional()
    .isObject()
    .withMessage('El ítem debe ser un objeto')
    .custom((value) => {
      if (value && (!value.variant_id || !value.quantity)) {
        throw new Error('El ítem debe incluir variant_id y quantity');
      }
      return true;
    }),
  body('item.variant_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El variant_id debe ser un número entero positivo'),
  body('item.quantity')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La cantidad debe ser un número entero positivo'),
  body('item.is_urgent')
    .optional()
    .isBoolean()
    .withMessage('is_urgent debe ser un booleano'),
  body('item.unit_price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El precio unitario debe ser un número válido'),
  body('item.customization_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El customization_id debe ser un número entero positivo'),
  body('item.option_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El option_id debe ser un número entero positivo'),
  body('item.unit_measure')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('La unidad de medida debe ser un número válido'),
  body('precalculatedTotals')
    .optional()
    .isObject()
    .withMessage('Los totales precalculados deben ser un objeto')
    .custom((value) => {
      if (!value) return true;
      return (
        typeof value.total === 'number' &&
        typeof value.total_discount === 'number' &&
        typeof value.shipping_cost === 'number' &&
        typeof value.total_urgent_delivery_fee === 'number' &&
        typeof value.estimated_delivery_days === 'number' &&
        (value.applied_promotions === undefined || Array.isArray(value.applied_promotions))
      );
    }).withMessage('Los totales precalculados tienen un formato inválido'),

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

      const { address_id, payment_method, coupon_code, delivery_option, item, precalculatedTotals } = req.body;
      const orderService = new OrderService();
      const { order, payment, paymentInstructions } = await orderService.createOrder(user_id, {
        address_id,
        payment_method,
        coupon_code,
        delivery_option,
        item,
        precalculatedTotals
      });

      loggerUtils.logUserActivity(user_id, 'create_order', `Orden creada: ID ${order.order_id}`);

      res.status(201).json({
        success: true,
        message: 'Orden creada exitosamente',
        data: {
          order_id: order.order_id,
          total: parseFloat(order.total.toFixed(2)),
          total_urgent_cost: parseFloat(order.total_urgent_cost.toFixed(2)) || 0.00,
          discount: parseFloat(order.discount.toFixed(2)) || 0.00,
          shipping_cost: parseFloat(order.shipping_cost.toFixed(2)) || 0.00,
          estimated_delivery_date: order.estimated_delivery_date,
          payment_instructions: paymentInstructions,
          status: order.order_status,
          coupon_code: order.coupon_code || null,
          applied_promotions: precalculatedTotals ? precalculatedTotals.applied_promotions || [] : []
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
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),
  query('searchTerm')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('El término de búsqueda debe ser una cadena entre 1 y 100 caracteres'),
  query('dateFilter')
    .optional()
    .custom((value) => {
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

// Obtener un resumen de las órdenes para el administrador
exports.getOrderSummary = [
  async (req, res) => {
    try {
      const orderService = new OrderService();
      const summary = await orderService.getOrderSummary();

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

// Obtener un resumen de órdenes para la skill de Alexa
exports.getOrderSummaryForAlexa = [
  query('statusFilter')
    .optional()
    .isIn(['all', 'pending', 'processing', 'shipped', 'delivered'])
    .withMessage('El filtro de estado debe ser uno de: all, pending, processing, shipped, delivered'),
  query('dateFilter')
    .optional()
    .custom((value) => {
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
  query('dateField')
    .optional()
    .isIn(['delivery', 'creation'])
    .withMessage('El campo de fecha debe ser uno de: delivery, creation'),

  async (req, res) => {
    try {
      const statusFilter = req.query.statusFilter || 'all';
      const dateFilter = req.query.dateFilter || '';
      const dateField = req.query.dateField || 'delivery';
      const errors = validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const orderService = new OrderService();
      const summary = await orderService.getOrderSummaryForAlexa(statusFilter, dateFilter, dateField);

      res.status(200).json({
        success: true,
        message: 'Resumen de órdenes para Alexa obtenido exitosamente',
        data: summary
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener el resumen de órdenes para Alexa',
        error: error.message
      });
    }
  }
];

// Obtener órdenes por fecha para administradores
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
      const orders = await orderService.getOrdersByDateForAdmin(date, dateField);

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
  query('paymentMethod').optional().isIn(['mercado_pago']).withMessage('El método de pago debe ser válido'),
  query('deliveryOption').optional().isIn(['Entrega a Domicilio', 'Puntos de Entrega', 'Recoger en Tienda']).withMessage('La opción de entrega debe be válida'),
  query('minTotal').optional().isFloat({ min: 0 }).withMessage('El total mínimo debe ser un número positivo'),
  query('maxTotal').optional().isFloat({ min: 0 }).withMessage('El total máximo debe ser un número positivo'),
  query('isUrgent').optional().isBoolean().withMessage('El filtro de urgencia debe ser un booleano'),

  async (req, res) => {
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
  }
];

// Obtener detalles de una orden por ID para administradores
exports.getOrderDetailsByIdForAdmin = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('El ID de la orden debe ser un número entero positivo'),

  async (req, res) => {
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
  body('paymentStatus')
    .optional()
    .isIn(['pending', 'approved', 'failed'])
    .withMessage('El estado del pago debe ser uno de: pending, approved, failed'),

  async (req, res) => {
    const adminId = req.user?.user_id;
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
      const { newStatus, paymentStatus } = req.body;
      const orderService = new OrderService();
      const updatedOrder = await orderService.updateOrderStatus(orderId, newStatus, adminId, paymentStatus);

      loggerUtils.logUserActivity(adminId || 'system', 'update_order_status', `Estado de la orden actualizado: ID ${orderId}, nuevo estado: ${newStatus}`);

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

// Obtener opciones de envío
exports.getShippingOptions = [
  async (req, res) => {
    try {
      const shippingOptions = await ShippingOption.findAll({
        where: { status: 'active' },
        attributes: ['shipping_option_id', 'name', 'base_cost']
      });
      res.status(200).json({
        success: true,
        data: shippingOptions.map(option => ({
          id: option.name,
          name: option.name,
          cost: parseFloat(option.base_cost)
        }))
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al obtener opciones de envío' });
    }
  }
];

// Manejar notificaciones de Mercado Pago
exports.handleMercadoPagoWebhook = [
  async (req, res) => {
    try {
      console.log('Webhook received:', req.body);
      const { type, id, data } = req.body;

      if (type === 'payment') {
        const paymentId = data.id;
        const payment = await mercadopago.payment.findById(paymentId);
        const paymentData = payment.body;
        console.log('Payment data:', paymentData);

        if (!paymentData || paymentData.status === 'not_found') {
          console.log(`Payment ID ${paymentId} not found. Skipping update.`);
          return res.status(200).send('OK');
        }

        const orderId = paymentData.external_reference;
        if (orderId) {
          const orderService = new OrderService();
          let newPaymentStatus = paymentData.status;
          if (newPaymentStatus === 'approved') newPaymentStatus = 'approved';
          else if (newPaymentStatus === 'pending' || newPaymentStatus === 'in_process') newPaymentStatus = 'pending';
          else if (newPaymentStatus === 'rejected') newPaymentStatus = 'failed';
          else newPaymentStatus = 'pending';

          const newOrderStatus = newPaymentStatus === 'approved' ? 'processing' : 'pending';
          console.log(`Updating order ${orderId}: paymentStatus=${newPaymentStatus}, orderStatus=${newOrderStatus}`);

          await orderService.updatePaymentStatus(orderId, newPaymentStatus);
          await orderService.updateOrderStatus(orderId, newOrderStatus, null, newPaymentStatus);

          loggerUtils.logUserActivity('system', 'webhook_payment_update', `Estado actualizado: Order ${orderId}, PaymentStatus ${newPaymentStatus}, OrderStatus ${newOrderStatus}`);
        }
      } else if (type === 'merchant_order') {
        const merchantOrderId = id;
        const merchantOrder = await mercadopago.merchant_orders.findById(merchantOrderId);
        const merchantOrderData = merchantOrder.body;
        console.log('Merchant order data:', merchantOrderData);

        if (merchantOrderData) {
          const payments = merchantOrderData.payments || [];
          const orderId = merchantOrderData.external_reference;

          if (orderId && payments.length > 0) {
            const orderService = new OrderService();
            const lastPayment = payments[payments.length - 1];
            let newPaymentStatus = lastPayment.status;
            if (newPaymentStatus === 'approved') newPaymentStatus = 'approved';
            else if (newPaymentStatus === 'pending' || newPaymentStatus === 'in_process') newPaymentStatus = 'pending';
            else if (newPaymentStatus === 'rejected') newPaymentStatus = 'failed';
            else newPaymentStatus = 'pending';

            const newOrderStatus = newPaymentStatus === 'approved' ? 'processing' : 'pending';
            console.log(`Updating order ${orderId}: paymentStatus=${newPaymentStatus}, orderStatus=${newOrderStatus}`);

            await orderService.updatePaymentStatus(orderId, newPaymentStatus);
            await orderService.updateOrderStatus(orderId, newOrderStatus, null, newPaymentStatus);

            loggerUtils.logUserActivity('system', 'webhook_merchant_order_update', `Estado actualizado: Order ${orderId}, PaymentStatus ${newPaymentStatus}, OrderStatus ${newOrderStatus}`);
          }
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Webhook error:', error);
      loggerUtils.logCriticalError(error);
      res.status(500).send('Error processing webhook');
    }
  }
];