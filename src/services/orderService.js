/* The OrderService class handles order operations, including creation, retrieval, and payment instruction 
generation, using direct model operations for consistency. */
require('dotenv').config();
const loggerUtils = require('../utils/loggerUtils');
const { Op, Sequelize } = require('sequelize');
const moment = require('moment');

// Importar todos los modelos necesarios al inicio del archivo
const { 
  Cart, 
  CartDetail, 
  Order, 
  OrderDetail, 
  OrderHistory, 
  Payment, 
  Address, 
  CouponUsage, 
  Promotion, 
  ProductVariant, 
  Customization,
  Product,
  ProductImage
} = require('../models/Associations');

class OrderService {
  /**
   * Creates an order from the user's cart, generates related records, and clears the cart.
   * @param {number} userId - The ID of the authenticated user.
   * @param {Object} orderData - The order data including address_id, payment_method, and coupon_code.
   * @returns {Object} - The created order, payment, and payment instructions.
   * @throws {Error} - If the cart is empty, address is invalid, or any operation fails.
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

      // Validar ítems urgentes
      for (const detail of cartDetails) {
        if (detail.is_urgent && !detail.ProductVariant?.Product?.urgent_delivery_enabled) {
          throw new Error(`El producto ${detail.ProductVariant?.Product?.name || 'desconocido'} no permite entrega urgente`);
        }
      }

      // Calcular costos y días de entrega
      let total_urgent_cost = 0;
      let maxDeliveryDays = 0;
      const orderDetailsData = [];

      for (const detail of cartDetails) {
        const product = detail.ProductVariant?.Product;
        const unitPrice = detail.unit_price || detail.ProductVariant?.calculated_price;
        if (!unitPrice) {
          throw new Error(`Precio no definido para el ítem ${product?.name || detail.variant_id}`);
        }

        const urgentCost = detail.is_urgent ? parseFloat(detail.urgent_delivery_fee || 0) : 0;
        total_urgent_cost += urgentCost * detail.quantity;

        const deliveryDays = detail.is_urgent ? product.urgent_delivery_days : product.standard_delivery_days;
        maxDeliveryDays = Math.max(maxDeliveryDays, deliveryDays);

        let itemDiscount = 0;
        if (detail.ProductVariant?.Promotions && detail.ProductVariant.Promotions.length > 0) {
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
      const shipping_cost = 20.00; // Placeholder hasta implementar opciones de envío
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
        delivery_option: null // Placeholder para opciones de envío
      }, { transaction });

      // Crear detalles del pedido
      try {
        for (const detailData of orderDetailsData) {
          await OrderDetail.create({
            ...detailData,
            order_id: order.order_id
          }, { transaction });
        }
      } catch (error) {
        throw new Error(`Error al crear detalles del pedido: ${error.message}`);
      }

      // Crear historial de la orden
      try {
        await OrderHistory.create({
          user_id: userId,
          order_id: order.order_id,
          purchase_date: new Date(),
          order_status: 'pending',
          total
        }, { transaction });
      } catch (error) {
        throw new Error(`Error al crear historial de la orden: ${error.message}`);
      }

      // Crear registro de pago
      let payment;
      try {
        payment = await Payment.create({
          order_id: order.order_id,
          payment_method,
          amount: total,
          status: 'pending',
          attempts: 0
        }, { transaction });
      } catch (error) {
        throw new Error(`Error al añadir registro de pago: ${error.message}`);
      }

      // Manejar cupones
      if (coupon_code && cart.promotion_id) {
        try {
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
        } catch (error) {
          throw new Error(`Error al procesar el cupón: ${error.message}`);
        }
      }

      // Limpiar carrito
      try {
        await CartDetail.destroy({ where: { cart_id: cart.cart_id }, transaction });
        await CouponUsage.destroy({ where: { cart_id: cart.cart_id }, transaction });
        await Cart.destroy({ where: { cart_id: cart.cart_id }, transaction });
      } catch (error) {
        throw new Error(`Error al limpiar el carrito: ${error.message}`);
      }

      await transaction.commit();

      // Generar instrucciones de pago
      const paymentInstructions = this.generatePaymentInstructions(payment_method, total);

      loggerUtils.logUserActivity(userId, 'create_order', `Orden creada exitosamente: order_id ${order.order_id}`);

      return { order, payment, paymentInstructions };
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al crear la orden: ${error.message}`);
    }
  }

    /**
   * Retrieves the details of a specific order for the authenticated user.
   * @param {number} userId - The ID of the authenticated user.
   * @param {number} orderId - The ID of the order to retrieve.
   * @returns {Object} - Structured order details including order info, items, address, payment, and history.
   * @throws {Error} - If the order is not found or does not belong to the user.
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
          [Sequelize.cast(Sequelize.col('Order.total'), 'FLOAT'), 'total'], // Explicitly reference Order.total
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
        throw new Error('Order not found or access denied');
      }

      // Calculate maximum delivery days
      let deliveryDays = 0;
      for (const detail of order.OrderDetails || []) {
        const product = detail.ProductVariant?.Product;
        const days = detail.is_urgent ? product?.urgent_delivery_days : product?.standard_delivery_days;
        if (days) {
          deliveryDays = Math.max(deliveryDays, days);
        }
      }

      // Generate payment instructions
      const paymentInstructions = this.generatePaymentInstructions(
        order.payment_method,
        parseFloat(order.total) || 0
      );

      // Format the response
      const orderDetails = {
        order: {
          order_id: order.order_id,
          status: order.order_status,
          created_at: order.created_at,
          estimated_delivery_date: order.estimated_delivery_date,
          delivery_days: deliveryDays,
          delivery_option: order.delivery_option || null,
          total: parseFloat(order.total) || 0,
          subtotal: order.OrderDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal || 0), 0),
          discount: parseFloat(order.discount) || 0,
          shipping_cost: parseFloat(order.shipping_cost) || 0,
        },
        items: order.OrderDetails.map(detail => ({
          detail_id: detail.order_detail_id,
          product_name: detail.ProductVariant?.Product?.name || 'Product not available',
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
          created_at: order.Payments?.[0]?.created_at || null,
          updated_at: order.Payments?.[0]?.updated_at || null,
          instructions: paymentInstructions
        },
        history: order.OrderHistories?.map(history => ({
          history_id: history.history_id,
          status: history.order_status,
          date: history.purchase_date
        })) || []
      };

      return orderDetails;
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error retrieving order details: ${error.message}`);
    }
  }

  /**
   * Retrieves a paginated list of all orders for the authenticated user with their details.
   * @param {number} userId - The ID of the authenticated user.
   * @param {number} page - The page number (default: 1).
   * @param {number} pageSize - The number of orders per page (default: 10).
   * @param {string} searchTerm - Optional search term to filter products by name.
   * @param {string} dateFilter - Optional year or date range (YYYY or YYYY-MM-DD,YYYY-MM-DD) to filter orders by creation date.
   * @returns {Object} - The list of orders with details and pagination metadata.
   * @throws {Error} - If there is an error retrieving the orders.
   */
  async getOrders(userId, page = 1, pageSize = 10, searchTerm = '', dateFilter = '') {
    try {
      const offset = (page - 1) * pageSize;
      const validStatuses = ['pending', 'delivered', 'processing', 'shipped'];

      // Build date condition
      let dateCondition = {};
      if (dateFilter) {
        const parts = dateFilter.split(',');
        if (parts.length === 1) {
          const year = parseInt(dateFilter);
          if (!isNaN(year)) {
            dateCondition = {
              created_at: {
                [Op.between]: [
                  moment.tz(`${year}-01-01`, 'UTC').startOf('year').toDate(),
                  moment.tz(`${year}-12-31`, 'UTC').endOf('year').toDate(),
                ],
              },
            };
          }
        } else if (parts.length === 2) {
          const [startDate, endDate] = parts;
          dateCondition = {
            created_at: {
              [Op.between]: [
                moment.tz(startDate, 'UTC').toDate(),
                moment.tz(endDate, 'UTC').toDate(),
              ],
            },
          };
        }
      }

      // Configure search condition for products
      let productCondition = {};
      if (searchTerm) {
        productCondition = { name: { [Op.like]: `%${searchTerm}%` } };
      }

      // Configure the query
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
                  required: true,
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
          'delivery_option',
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
          created_at: order.created_at,
          estimated_delivery_date: order.estimated_delivery_date,
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
   * Generates payment instructions based on the payment method.
   * @param {string} paymentMethod - The payment method chosen by the user.
   * @param {number} amount - The total amount of the order.
   * @returns {Object} - The payment instructions including method, reference, and details.
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
          instructions: `Contacta al soporte para obtener instrucciones de pago. Monto: $${amount.toFixed(2)}.`
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