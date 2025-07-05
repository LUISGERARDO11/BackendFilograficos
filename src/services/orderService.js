require('dotenv').config();
const loggerUtils = require('../utils/loggerUtils');
const { Op, Sequelize } = require('sequelize');
const moment = require('moment-timezone');
const orderUtils = require('../utils/orderUtils');
const NotificationManager = require('./notificationManager');

// Importar todos los modelos necesarios al inicio del archivo
const { Cart, CartDetail, Order, OrderDetail, OrderHistory, Payment, Address, CouponUsage, Promotion, ProductVariant, Customization, Product, ProductImage, User } = require('../models/Associations');

class OrderService {
  /**
   * Crea una orden a partir del carrito del usuario, genera registros relacionados, actualiza el stock y limpia el carrito.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {Object} orderData - Los datos de la orden incluyendo address_id, payment_method y coupon_code.
   * @returns {Object} - La orden creada, el pago y las instrucciones de pago.
   * @throws {Error} - Si el carrito está vacío, la dirección es inválida, el stock es insuficiente o falla alguna operación.
   */
  async createOrder(userId, { address_id, payment_method, coupon_code }) {
    const transaction = await Cart.sequelize.transaction();
    try {
      // Verificar dirección si se proporciona
      let address = null;
      if (address_id) {
        address = await Address.findOne({ where: { address_id, user_id: userId }, transaction });
        if (!address) {
          throw new Error('Dirección no válida');
        }
      }

      // Obtener carrito del usuario
      const cart = await Cart.findOne({
        where: { user_id: userId },
        include: [{ model: CouponUsage }],
        transaction
      });

      if (!cart) {
        throw new Error('Carrito no encontrado');
      }

      // Obtener detalles del carrito
      const cartDetails = await CartDetail.findAll({
        where: { cart_id: cart.cart_id },
        include: [
          {
            model: ProductVariant,
            include: [
              {
                model: Product,
                attributes: ['product_id', 'name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'urgent_delivery_cost', 'standard_delivery_days']
              },
              {
                model: Promotion,
                through: { attributes: [] },
                where: {
                  status: 'active',
                  start_date: { [Op.lte]: new Date() },
                  end_date: { [Op.gte]: new Date() }
                },
                required: false
              }
            ]
          },
          { model: Customization }
        ],
        transaction
      });

      if (!cartDetails || cartDetails.length === 0) {
        throw new Error('Carrito vacío');
      }

      // Validar ítems urgentes y disponibilidad de stock
      for (const detail of cartDetails) {
        const variant = detail.ProductVariant;
        const product = variant?.Product;
        if (!variant || !product) {
          throw new Error(`Variante o producto no encontrado para el ítem ${detail.variant_id}`);
        }
        if (detail.is_urgent && !product.urgent_delivery_enabled) {
          throw new Error(`El producto ${product.name || 'desconocido'} no permite entrega urgente`);
        }
        if (variant.stock < detail.quantity) {
          throw new Error(`Stock insuficiente para el producto ${product.name || 'desconocido'} (SKU: ${variant.sku}). Disponible: ${variant.stock}, Requerido: ${detail.quantity}`);
        }
      }

      // Calcular costos y días de entrega
      let total_urgent_cost = 0;
      let maxDeliveryDays = 0;
      const orderDetailsData = [];

      for (const detail of cartDetails) {
        const product = detail.ProductVariant.Product;
        const unitPrice = detail.unit_price || detail.ProductVariant.calculated_price;
        if (!unitPrice) {
          throw new Error(`Precio no definido para el ítem ${product.name || detail.variant_id}`);
        }

        const urgentCost = detail.is_urgent ? parseFloat(detail.urgent_delivery_fee || 0) : 0;
        total_urgent_cost += urgentCost * detail.quantity;

        const deliveryDays = detail.is_urgent ? product.urgent_delivery_days : product.standard_delivery_days;
        maxDeliveryDays = Math.max(maxDeliveryDays, deliveryDays);

        let itemDiscount = 0;
        if (detail.ProductVariant.Promotions && detail.ProductVariant.Promotions.length > 0) {
          itemDiscount = detail.ProductVariant.Promotions.reduce((sum, promo) => {
            if (promo.promotion_type === 'order_count_discount' && promo.is_applicable) {
              return sum + (detail.quantity * unitPrice) * (promo.discount_value / 100);
            }
            return sum;
          }, 0);
        }

        orderDetailsData.push({
          variant_id: detail.variant_id,
          option_id: detail.option_id,
          customization_id: detail.customization_id,
          quantity: detail.quantity,
          unit_price: unitPrice,
          subtotal: (detail.quantity * unitPrice) + urgentCost,
          discount_applied: itemDiscount,
          unit_measure: detail.unit_measure || 1.00,
          is_urgent: detail.is_urgent,
          additional_cost: urgentCost
        });
      }

      // Calcular subtotal, descuento y total
      const subtotal = orderDetailsData.reduce((sum, detail) => sum + (detail.quantity * detail.unit_price), 0);
      const discount = orderDetailsData.reduce((sum, detail) => sum + detail.discount_applied, 0);
      const shipping_cost = 20.00;
      const total = Math.max(0, subtotal + shipping_cost - discount);

      // Calcular fecha estimada de entrega
      const estimated_delivery_date = moment().add(maxDeliveryDays, 'days').toDate();

      // Crear orden
      const order = await Order.create({
        user_id: userId,
        address_id: address_id || null,
        total,
        total_urgent_cost,
        discount,
        shipping_cost,
        payment_status: 'pending',
        payment_method,
        order_status: 'pending',
        estimated_delivery_date,
        delivery_option: null
      }, { transaction });

      // Crear detalles del pedido
      for (const detailData of orderDetailsData) {
        await OrderDetail.create({
          ...detailData,
          order_id: order.order_id
        }, { transaction });
      }

      // Actualizar stock de las variantes
      for (const detail of cartDetails) {
        const variant = await ProductVariant.findOne({
          where: { variant_id: detail.variant_id },
          transaction
        });
        if (variant) {
          await variant.update({
            stock: variant.stock - detail.quantity,
            updated_at: new Date()
          }, { transaction });
        } else {
          throw new Error(`Variante no encontrada: ${detail.variant_id}`);
        }
      }

      // Crear historial de la orden
      await OrderHistory.create({
        user_id: userId,
        order_id: order.order_id,
        purchase_date: new Date(),
        order_status: 'pending',
        total
      }, { transaction });

      // Crear registro de pago
      const payment = await Payment.create({
        order_id: order.order_id,
        payment_method,
        amount: total,
        status: 'pending',
        attempts: 0
      }, { transaction });

      // Manejar cupones
      if (coupon_code && cart.promotion_id) {
        const coupon = await CouponUsage.findOne({
          where: { user_id: userId, cart_id: cart.cart_id, promotion_id: cart.promotion_id },
          transaction
        });
        if (coupon) {
          await CouponUsage.create({
            user_id: userId,
            order_id: order.order_id,
            promotion_id: cart.promotion_id,
            usage_date: new Date()
          }, { transaction });
        } else {
          throw new Error('Cupón no válido');
        }
      }

      // Limpiar carrito
      await CartDetail.destroy({ where: { cart_id: cart.cart_id }, transaction });
      await CouponUsage.destroy({ where: { cart_id: cart.cart_id }, transaction });
      await Cart.destroy({ where: { cart_id: cart.cart_id }, transaction });

      await transaction.commit();

      // Ajuste: Eliminar 'sku' de Product y moverlo a ProductVariant
      const orderDetails = await OrderDetail.findAll({
        where: { order_id: order.order_id },
        include: [
          {
            model: ProductVariant,
            attributes: ['variant_id', 'sku', 'calculated_price'],
            include: [{ model: Product, attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'] }]
          }
        ]
      });

      // Obtener datos del usuario
      const user = await User.findOne({
        where: { user_id: userId },
        attributes: ['user_id', 'name', 'email']
      });

      const paymentInstructions = this.generatePaymentInstructions(payment_method, total);

      loggerUtils.logUserActivity(userId, 'create_order', `Orden creada exitosamente: order_id ${order.order_id}`);

      this.notifyOrderCreation(order, user, orderDetails, payment).catch(err => {
        loggerUtils.logCriticalError(err, 'Error al enviar notificación asíncrona');
      });

      return { order, payment, paymentInstructions };
    } catch (error) {
      if (transaction && !transaction.finished) {
        await transaction.rollback();
      }
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al crear la orden: ${error.message}`);
    }
  }

  async notifyOrderCreation(order, user, orderDetails, payment) {
    const notificationManager = new NotificationManager();
    await notificationManager.notifyNewOrder(order, user, orderDetails, payment);
  }

  /**
   * Obtiene los detalles de una orden específica para el usuario autenticado.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {number} orderId - El ID de la orden a obtener.
   * @returns {Object} - Detalles estructurados de la orden incluyendo información, ítems, dirección, pago e historial.
   * @throws {Error} - Si la orden no se encuentra o no pertenece al usuario.
   */
  async getOrderById(userId, orderId) {
    try {
      const order = await Order.findOne({
        where: {
          order_id: orderId,
          user_id: userId
        },
        attributes: [
          'order_id',
          'user_id',
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option'
        ],
        include: [
          {
            model: OrderDetail,
            attributes: [
              'order_detail_id',
              'quantity',
              'unit_price',
              'subtotal',
              'discount_applied',
              'unit_measure',
              'is_urgent',
              'additional_cost',
              'variant_id'
            ],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id', 'calculated_price'],
                include: [
                  {
                    model: Product,
                    attributes: [
                      'product_id',
                      'name',
                      'urgent_delivery_enabled',
                      'urgent_delivery_days',
                      'standard_delivery_days'
                    ]
                  },
                  {
                    model: ProductImage,
                    attributes: ['image_url'],
                    limit: 1,
                    required: false
                  }
                ],
                required: false
              },
              {
                model: Customization,
                attributes: ['customization_id', 'content', 'file_url', 'comments'],
                required: false
              }
            ]
          },
          {
            model: Address,
            attributes: [
              'address_id',
              'street',
              'city',
              'state',
              'postal_code',
            ],
            required: false
          },
          {
            model: Payment,
            attributes: [
              'payment_id',
              'payment_method',
              'amount',
              'status',
              'created_at',
              'updated_at'
            ],
            required: false
          },
          {
            model: OrderHistory,
            attributes: [
              'history_id',
              'order_status',
              'purchase_date',
            ],
            required: false,
            order: [['purchase_date', 'ASC']]
          }
        ]
      });

      if (!order) {
        throw new Error('Orden no encontrada o acceso denegado');
      }

      // Calcular máximo de días de entrega
      let deliveryDays = 0;
      for (const detail of order.OrderDetails || []) {
        const product = detail.ProductVariant?.Product;
        const days = detail.is_urgent ? product?.urgent_delivery_days : product?.standard_delivery_days;
        if (days) {
          deliveryDays = Math.max(deliveryDays, days);
        }
      }

      // Generar instrucciones de pago
      const paymentInstructions = this.generatePaymentInstructions(
        order.payment_method,
        parseFloat(order.total) || 0
      );

      // Formatear la respuesta
      const orderDetails = {
        order: {
          order_id: order.order_id,
          status: order.order_status,
          created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          delivery_days: deliveryDays,
          delivery_option: order.delivery_option || null,
          total: parseFloat(order.total) || 0,
          subtotal: order.OrderDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal || 0), 0),
          discount: parseFloat(order.discount) || 0,
          shipping_cost: parseFloat(order.shipping_cost) || 0,
        },
        items: order.OrderDetails.map(detail => ({
          detail_id: detail.order_detail_id,
          product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
          quantity: detail.quantity,
          unit_price: parseFloat(detail.unit_price) || 0,
          subtotal: parseFloat(detail.subtotal) || 0,
          discount_applied: parseFloat(detail.discount_applied) || 0,
          unit_measure: parseFloat(detail.unit_measure) || 1.00,
          is_urgent: detail.is_urgent,
          additional_cost: parseFloat(detail.additional_cost) || 0,
          product_image: detail.ProductVariant?.ProductImages?.[0]?.image_url || 'https://via.placeholder.com/100?text=No+Image',
          customization: detail.Customization ? {
            customization_id: detail.Customization.customization_id,
            content: detail.Customization.content,
            file_url: detail.Customization.file_url,
            comments: detail.Customization.comments
          } : null
        })),
        address: order.Address ? {
          address_id: order.Address.address_id,
          street: order.Address.street,
          city: order.Address.city,
          state: order.Address.state,
          postal_code: order.Address.postal_code,
        } : null,
        payment: {
          method: order.payment_method,
          status: order.Payments?.[0]?.status || 'pending',
          amount: order.Payments?.[0] ? parseFloat(order.Payments[0].amount) : parseFloat(order.total) || 0,
          payment_id: order.Payments?.[0]?.payment_id || null,
          created_at: order.Payments?.[0]?.created_at
            ? moment(order.Payments[0].created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
            : null,
          updated_at: order.Payments?.[0]?.updated_at
            ? moment(order.Payments[0].updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
            : null,
          instructions: paymentInstructions
        },
        history: order.OrderHistories?.map(history => ({
          history_id: history.history_id,
          status: history.order_status,
          date: moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        })) || []
      };

      return orderDetails;
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener los detalles de la orden: ${error.message}`);
    }
  }

  /**
   * Obtiene una lista paginada de todas las órdenes para el usuario autenticado con sus detalles.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {number} page - El número de página (por defecto: 1).
   * @param {number} pageSize - El número de órdenes por página (por defecto: 10).
   * @param {string} searchTerm - Término de búsqueda opcional para filtrar productos por nombre.
   * @param {string} dateFilter - Año, fecha única o rango de fechas (YYYY, YYYY-MM-DD, o YYYY-MM-DD,YYYY-MM-DD).
   * @returns {Object} - La lista de órdenes con detalles y metadatos de paginación.
   * @throws {Error} - Si hay un error al obtener las órdenes.
   */
  async getOrders(userId, page = 1, pageSize = 10, searchTerm = '', dateFilter = '') {
    try {
      const offset = (page - 1) * pageSize;
      const validStatuses = ['pending', 'delivered', 'processing', 'shipped'];

      // Construir condición de fecha
      const dateCondition = orderUtils.buildDateCondition(dateFilter, 'created_at');

      // Configurar condición de búsqueda para productos
      let productCondition = {};
      if (searchTerm) {
        productCondition = { name: { [Op.like]: `%${searchTerm}%` } };
      }

      // Configurar la consulta
      const include = [
        {
          model: OrderDetail,
          attributes: ['order_detail_id', 'quantity', 'unit_price', 'subtotal', 'discount_applied', 'unit_measure', 'is_urgent', 'additional_cost', 'variant_id'],
          required: true,
          include: [
            {
              model: ProductVariant,
              attributes: ['variant_id', 'calculated_price'],
              required: false,
              include: [
                {
                  model: Product,
                  attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'],
                  where: productCondition,
                  required: false,
                },
                {
                  model: ProductImage,
                  attributes: ['image_url'],
                  limit: 1,
                  required: false,
                },
              ],
            },
            {
              model: Customization,
              attributes: ['customization_id', 'content', 'file_url', 'comments'],
              required: false,
            },
          ],
        },
        {
          model: Payment,
          attributes: ['status'],
          required: false,
        },
      ];

      const where = {
        user_id: userId,
        order_status: { [Op.in]: validStatuses },
        ...dateCondition,
      };

      if (searchTerm) {
        where[Op.or] = [
          {
            '$OrderDetails.ProductVariant.Product.name$': {
              [Op.like]: `%${searchTerm}%`,
            },
          },
        ];
      }

      const { count, rows } = await Order.findAndCountAll({
        where,
        attributes: [
          'order_id',
          [Sequelize.cast(Sequelize.col('total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option'
        ],
        include,
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
        subQuery: false,
      });

      console.log(`Usuario ${userId}: ${count} órdenes contadas, ${rows.length} órdenes retornadas`);

      const orders = rows.map((order) => {
        let deliveryDays = 0;
        for (const detail of order.OrderDetails || []) {
          const product = detail.ProductVariant?.Product;
          const days = detail.is_urgent ? product?.urgent_delivery_days : product?.standard_delivery_days;
          if (days) {
            deliveryDays = Math.max(deliveryDays, days);
          }
        }

        return {
          order_id: order.order_id,
          total: parseFloat(order.total) || 0,
          order_status: order.order_status,
          payment_status: order.Payments?.[0]?.status || 'pending',
          created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          delivery_days: deliveryDays,
          delivery_option: order.delivery_option || null,
          total_items: order.OrderDetails?.reduce((sum, detail) => sum + (detail.quantity || 0), 0) || 0,
          order_details: order.OrderDetails.map(detail => ({
            order_detail_id: detail.order_detail_id,
            product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
            quantity: detail.quantity,
            unit_price: parseFloat(detail.unit_price) || 0,
            subtotal: parseFloat(detail.subtotal) || 0,
            discount_applied: parseFloat(detail.discount_applied) || 0,
            unit_measure: parseFloat(detail.unit_measure) || 1.00,
            is_urgent: detail.is_urgent,
            additional_cost: parseFloat(detail.additional_cost || 0),
            product_image: detail.ProductVariant?.ProductImages?.[0]?.image_url || 'https://via.placeholder.com/100?text=No+Image',
            customization: detail.Customization ? {
              customization_id: detail.Customization.customization_id,
              content: detail.Customization.content,
              file_url: detail.Customization.file_url,
              comments: detail.Customization.comments,
            } : null,
          })),
        };
      });

      return {
        orders,
        pagination: {
          totalOrders: count,
          currentPage: page,
          pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
      };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener las órdenes: ${error.message}`);
    }
  }

  /**
   * Obtiene un resumen global de estadísticas de órdenes para administradores.
   * @returns {Object} - Estadísticas de resumen (totales por estado).
   * @throws {Error} - Si hay un error al obtener las estadísticas.
   */
  async getOrderSummary() {
    try {
      const result = await Order.findAll({
        attributes: [
          [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'total'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'pending' THEN 1 END")), 'pending'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'processing' THEN 1 END")), 'processing'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'shipped' THEN 1 END")), 'shipped'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'delivered' THEN 1 END")), 'delivered']
        ],
        raw: true
      });

      return {
        total: parseInt(result[0].total) || 0,
        pending: parseInt(result[0].pending) || 0,
        processing: parseInt(result[0].processing) || 0,
        shipped: parseInt(result[0].shipped) || 0,
        delivered: parseInt(result[0].delivered) || 0
      };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener el resumen de órdenes: ${error.message}`);
    }
  }

   /**
   * Obtiene órdenes para una fecha específica para el panel de administración.
   * @param {string} date - Fecha en formato YYYY-MM-DD.
   * @param {string} dateField - Campo de fecha a filtrar ('delivery' o 'creation').
   * @param {number} adminId - ID del administrador.
   * @returns {Array} - Lista de órdenes formateadas para la fecha especificada.
   * @throws {Error} - Si la fecha es inválida o hay un error en la consulta.
   */
  //async getOrdersByDateForAdmin(date, dateField, adminId) {
  async getOrdersByDateForAdmin(date, dateField) {
    try {
      // Validar que adminId pertenece a un administrador
      //const admin = await User.findOne({ where: { user_id: adminId, user_type: 'administrador' } });
      //if (!admin) {
      //  throw new Error('Usuario administrador no válido');
      //}

      // Validar formato de fecha
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(date)) {
        throw new Error('Formato de fecha inválido: debe ser YYYY-MM-DD');
      }
      const targetDate = moment.tz(date, 'America/Mexico_City').tz('UTC');
      if (!targetDate.isValid()) {
        throw new Error('Fecha inválida');
      }

      const field = dateField === 'delivery' ? 'estimated_delivery_date' : 'created_at';
      const dateCondition = {
        [field]: {
          [Op.between]: [
            targetDate.startOf('day').toDate(),
            targetDate.endOf('day').toDate(),
          ],
        },
      };

      const validStatuses = ['pending', 'processing', 'shipped', 'delivered'];
      const where = {
        order_status: { [Op.in]: validStatuses },
        ...dateCondition,
      };

      const orders = await Order.findAll({
        where,
        attributes: [
          'order_id',
          'user_id',
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option',
        ],
        include: [
          {
            model: OrderDetail,
            attributes: ['order_detail_id', 'quantity', 'unit_price', 'subtotal', 'discount_applied', 'unit_measure', 'is_urgent', 'additional_cost', 'variant_id'],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id', 'calculated_price'],
                include: [
                  {
                    model: Product,
                    attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'],
                    required: false,
                  },
                ],
                required: false,
              },
            ],
          },
          {
            model: User,
            attributes: ['name'],
            required: true,
          },
          {
            model: Address,
            attributes: ['address_id', 'street', 'city', 'state', 'postal_code'],
            required: false,
          },
          {
            model: Payment,
            attributes: ['payment_id', 'payment_method', 'amount', 'status', 'created_at', 'updated_at'],
            required: false,
          },
          {
            model: OrderHistory,
            attributes: ['history_id', 'order_status', 'purchase_date'],
            required: false,
            order: [['purchase_date', 'ASC']],
          },
        ],
        order: [[field, 'DESC']],
      });

      //loggerUtils.logUserActivity(adminId, 'get_orders_by_date_admin', `Órdenes obtenidas para la fecha ${date}, campo: ${dateField}`);

      return orders.map(order => ({
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        payment: order.Payments?.[0] ? {
          ...order.Payments[0].dataValues,
          created_at: moment(order.Payments[0].created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          updated_at: moment(order.Payments[0].updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
        history: order.OrderHistories?.map(history => ({
          ...history.dataValues,
          purchase_date: moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        })) || []
      }));
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener órdenes por fecha: ${error.message}`);
    }
  }

  /**
   * Obtiene una lista paginada de órdenes para el panel de administración con filtros y estadísticas.
   * @param {number} page - El número de página (por defecto: 1).
   * @param {number} pageSize - El número de órdenes por página (por defecto: 10).
   * @param {string} searchTerm - Término de búsqueda opcional para cliente o ID de orden.
   * @param {string} statusFilter - Filtro de estado ('all', 'pending', 'processing', 'shipped', 'delivered').
   * @param {string} dateFilter - Filtro de fecha (YYYY, YYYY-MM-DD, o YYYY-MM-DD,YYYY-MM-DD).
   * @param {string} dateField - Campo de fecha a filtrar ('delivery' o 'creation').
   * @returns {Object} - Lista de órdenes, paginación y resumen estadístico.
   * @throws {Error} - Si hay un error al obtener las órdenes.
   */
  async getOrdersForAdmin(page = 1, pageSize = 10, searchTerm = '', statusFilter = 'all', dateFilter = '', dateField = 'delivery', paymentMethod = '', deliveryOption = '', minTotal = null, maxTotal = null, isUrgent = null) {
    try {
      const offset = (page - 1) * pageSize;
      const validStatuses = ['pending', 'processing', 'shipped', 'delivered'];

      // Construir condiciones de consulta
      const field = dateField === 'delivery' ? 'estimated_delivery_date' : 'created_at';
      const dateCondition = orderUtils.buildDateCondition(dateFilter, field);

      let where = {};
      if (statusFilter !== 'all' && orderUtils.isValidOrderStatus(statusFilter)) {
        where.order_status = statusFilter;
      } else {
        where.order_status = { [Op.in]: validStatuses };
      }
      where = { ...where, ...dateCondition };

      // Filtros adicionales
      if (paymentMethod) {
        where.payment_method = paymentMethod;
      }
      if (deliveryOption) {
        where.delivery_option = deliveryOption;
      }
      if (minTotal !== null) {
        where.total = { ...where.total, [Op.gte]: parseFloat(minTotal) };
      }
      if (maxTotal !== null) {
        where.total = { ...where.total, [Op.lte]: parseFloat(maxTotal) };
      }

      if (searchTerm) {
        where[Op.or] = [
          { order_id: isNaN(parseInt(searchTerm)) ? -1 : parseInt(searchTerm) },
          { '$User.name$': { [Op.like]: `%${searchTerm}%` } },
          { '$OrderDetails.ProductVariant.Product.name$': { [Op.like]: `%${searchTerm}%` } },
        ];
      }

      const include = [
        {
          model: OrderDetail,
          attributes: ['order_detail_id', 'quantity', 'unit_price', 'subtotal', 'discount_applied', 'unit_measure', 'is_urgent', 'additional_cost', 'variant_id'],
          where: isUrgent !== null ? { is_urgent: isUrgent } : {},
          required: searchTerm || isUrgent !== null,
          include: [
            {
              model: ProductVariant,
              attributes: ['variant_id', 'calculated_price'],
              required: searchTerm ? true : false,
              include: [
                {
                  model: Product,
                  attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'],
                  required: searchTerm ? true : false,
                },
              ],
            },
          ],
        },
        {
          model: User,
          attributes: ['name'],
          required: true,
        },
        {
          model: Payment,
          attributes: ['status', 'payment_method', 'amount', 'created_at', 'updated_at'],
          required: false,
        },
        {
          model: Address,
          attributes: ['address_id', 'street', 'city', 'state', 'postal_code'],
          required: false,
        },
        {
          model: OrderHistory,
          attributes: ['history_id', 'order_status', 'purchase_date'],
          required: false,
          order: [['purchase_date', 'ASC']],
        },
      ];

      const startTime = Date.now();
      const { count, rows } = await Order.findAndCountAll({
        where,
        attributes: [
          'order_id',
          'user_id',
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option',
          [Sequelize.fn('DATE', Sequelize.col(`Order.${field}`)), 'order_date'],
        ],
        include,
        order: [[field, 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
        subQuery: false,
      });
      console.log(`Query took ${Date.now() - startTime}ms`);

      if (count === 0) {
        return {
          orders: [],
          ordersByDay: {},
          pagination: { totalOrders: 0, currentPage: page, pageSize, totalPages: 0 },
          summary: { totalOrders: 0, pendingCount: 0, processingCount: 0, shippedCount: 0, deliveredCount: 0 },
        };
      }

      const ordersByDay = {};
      rows.forEach(order => {
        const dateKey = moment.utc(order[field]).format('YYYY-MM-DD');
        if (!ordersByDay[dateKey]) {
          ordersByDay[dateKey] = [];
        }
        ordersByDay[dateKey].push(orderUtils.formatOrderDetails(order));
      });

      console.log(`Admin: ${count} órdenes contadas, ${rows.length} órdenes retornadas`);
      console.log(`Order IDs retornados: ${rows.map(order => order.order_id).join(', ')}`);

      const ordersFormatted = rows.map(order => ({
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        payment: order.Payments?.[0] ? {
          ...order.Payments[0].dataValues,
          created_at: moment(order.Payments[0].created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          updated_at: moment(order.Payments[0].updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
        history: order.OrderHistories?.map(history => ({
          ...history.dataValues,
          purchase_date: moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        })) || []
      }));
      const summary = orderUtils.calculateOrderSummary(ordersFormatted);

      return {
        orders: ordersFormatted,
        ordersByDay,
        pagination: {
          totalOrders: count,
          currentPage: page,
          pageSize,
          totalPages: Math.ceil(count / pageSize),
        },
        summary,
      };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener las órdenes para admin: ${error.message}`);
    }
  }

  /**
   * Obtiene los detalles de una orden específica para el panel de administración.
   * @param {number} orderId - El ID de la orden a obtener.
   * @returns {Object} - Detalles estructurados de la orden.
   * @throws {Error} - Si la orden no se encuentra.
   */
  async getOrderDetailsByIdForAdmin(orderId) {
    try {
      const order = await Order.findOne({
        where: { order_id: orderId },
        attributes: [
          'order_id',
          'user_id',
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          [Sequelize.cast(Sequelize.col('Order.discount'), 'FLOAT'), 'discount'],
          [Sequelize.cast(Sequelize.col('Order.shipping_cost'), 'FLOAT'), 'shipping_cost'],
          'estimated_delivery_date',
          'delivery_option',
        ],
        include: [
          {
            model: OrderDetail,
            attributes: [
              'order_detail_id',
              'quantity',
              'unit_price',
              'subtotal',
              'discount_applied',
              'unit_measure',
              'is_urgent',
              'additional_cost',
              'variant_id',
            ],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id', 'calculated_price'],
                include: [
                  {
                    model: Product,
                    attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'],
                    required: false,
                  },
                ],
                required: false,
              },
            ],
          },
          {
            model: User,
            attributes: ['name'],
            required: true,
          },
          {
            model: Address,
            attributes: ['address_id', 'street', 'city', 'state', 'postal_code'],
            required: false,
          },
          {
            model: Payment,
            attributes: ['payment_id', 'payment_method', 'amount', 'status', 'created_at', 'updated_at'],
            required: false,
          },
          {
            model: OrderHistory,
            attributes: ['history_id', 'order_status', 'purchase_date'],
            required: false,
            order: [['purchase_date', 'ASC']],
          },
        ],
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }

      return {
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        payment: order.Payments?.[0] ? {
          ...order.Payments[0].dataValues,
          created_at: moment(order.Payments[0].created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          updated_at: moment(order.Payments[0].updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
        history: order.OrderHistories?.map(history => ({
          ...history.dataValues,
          purchase_date: moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        })) || []
      };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener los detalles de la orden: ${error.message}`);
    }
  }

  /**
   * Actualiza el estado de una orden y registra el cambio en el historial.
   * @param {number} orderId - El ID de la orden a actualizar.
   * @param {string} newStatus - El nuevo estado ('pending', 'processing', 'shipped', 'delivered').
   * @param {number} adminId - El ID del administrador que realiza el cambio.
   * @returns {Object} - La orden actualizada.
   * @throws {Error} - Si el estado es inválido o la orden no se encuentra.
   */
  async updateOrderStatus(orderId, newStatus, adminId) {
    const transaction = await Order.sequelize.transaction();
    try {
      if (!orderUtils.isValidOrderStatus(newStatus)) {
        throw new Error('Estado de orden inválido');
      }

      // Validar que adminId pertenece a un administrador
      const admin = await User.findOne({
        where: { user_id: adminId, user_type: 'administrador' },
        transaction,
      });
      if (!admin) {
        throw new Error('Usuario administrador no válido');
      }

      // Obtener la orden con todas las relaciones necesarias
      const order = await Order.findOne({
        where: { order_id: orderId },
        attributes: [
          'order_id',
          'user_id',
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'],
          'order_status',
          'payment_method',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option',
        ],
        include: [
          {
            model: OrderDetail,
            attributes: ['order_detail_id', 'quantity', 'unit_price', 'subtotal', 'discount_applied', 'unit_measure', 'is_urgent', 'additional_cost', 'variant_id'],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id', 'calculated_price'],
                include: [
                  {
                    model: Product,
                    attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days'],
                    required: false,
                  },
                ],
                required: false,
              },
            ],
          },
          {
            model: User,
            attributes: ['name'],
            required: true,
          },
          {
            model: Address,
            attributes: ['address_id', 'street', 'city', 'state', 'postal_code'],
            required: false,
          },
          {
            model: Payment,
            attributes: ['payment_id', 'payment_method', 'amount', 'status', 'created_at', 'updated_at'],
            required: false,
          },
          {
            model: OrderHistory,
            attributes: ['history_id', 'order_status', 'purchase_date'],
            required: false,
            order: [['purchase_date', 'ASC']],
          },
        ],
        transaction,
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }

      // Actualizar el estado de la orden
      await order.update({ order_status: newStatus }, { transaction });

      // Actualizar el estado del pago si la orden está en 'delivered'
      if (newStatus === 'delivered') {
        const payment = await Payment.findOne({ where: { order_id: orderId }, transaction });
        if (payment && payment.status !== 'validated') {
          await payment.update({ status: 'validated' }, { transaction });
        }
      }

      // Registrar el cambio en el historial
      await OrderHistory.create({
        user_id: order.user_id,
        order_id: order.order_id,
        purchase_date: new Date(),
        order_status: newStatus,
        total: parseFloat(order.total) || 0,
        updated_by: adminId,
      }, { transaction });

      // Actualizar el objeto order con el nuevo estado para devolverlo
      order.order_status = newStatus;

      // Confirmar la transacción
      await transaction.commit();

      // Obtener detalles de la orden para la notificación
      const orderDetails = await OrderDetail.findAll({
        where: { order_id: order.order_id },
        include: [
          {
            model: ProductVariant,
            include: [{ model: Product, attributes: ['name'] }]
          }
        ]
      });

      // Obtener datos del usuario
      const user = await User.findOne({
        where: { user_id: order.user_id },
        attributes: ['user_id', 'name', 'email']
      });

      // Obtener datos del pago
      const payment = await Payment.findOne({ where: { order_id: order.order_id } });

      // Enviar notificación al cliente
      const notificationManager = new NotificationManager();
      await notificationManager.notifyOrderStatusChange(order, user, orderDetails, payment);

      // Registrar la actividad
      loggerUtils.logUserActivity(adminId, 'update_order_status', `Estado de la orden actualizado: ID ${orderId}, nuevo estado: ${newStatus}`);

      return {
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        payment: order.Payments?.[0] ? {
          ...order.Payments[0].dataValues,
          created_at: moment(order.Payments[0].created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          updated_at: moment(order.Payments[0].updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
        history: order.OrderHistories?.map(history => ({
          ...history.dataValues,
          purchase_date: moment(history.purchase_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        })) || []
      };
    } catch (error) {
      // Solo intentar revertir si la transacción no se ha confirmado
      if (!transaction.finished) {
        await transaction.rollback();
      }
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al actualizar el estado de la orden: ${error.message}`);
    }
  }

  /**
   * Genera instrucciones de pago basadas en el método de pago.
   * @param {string} paymentMethod - El método de pago elegido por el usuario.
   * @param {number} amount - El monto total de la orden.
   * @returns {Object} - Las instrucciones de pago incluyendo método, referencia y detalles.
   */
  generatePaymentInstructions(paymentMethod, amount) {
    switch (paymentMethod) {
      case 'bank_transfer_oxxo':
        return {
          method: 'Oxxo',
          reference: `OX${Math.floor(Math.random() * 1000000000)}`,
          amount,
          instructions: `Realiza el depósito en cualquier tienda Oxxo con la referencia proporcionada. Sube el comprobante en el portal.`
        };
      case 'bank_transfer_bbva':
        return {
          method: 'BBVA',
          account: '1234 5678 9012 3456',
          clabe: '012345678901234567',
          amount,
          instructions: `Realiza la transferencia al número de cuenta o CLABE proporcionado. Sube el comprobante en el portal.`
        };
      case 'bank_transfer':
        return {
          method: 'Bank Transfer',
          amount,
          instructions: `Contacta al soporte para obtener instrucciones de pago. Monto: ${orderUtils.formatCurrency(amount)}.`
        };
      default:
        return {
          method: 'Unknown',
          amount,
          instructions: `Método de pago no soportado. Contacta al soporte.`
        };
    }
  }
}

module.exports = OrderService;