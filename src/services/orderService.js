/* The OrderService class handles the creation of orders from a user's cart, including payment instruction 
   generation and cart cleanup, using direct model operations for consistency. */
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
  ProductImage // Asumiendo que existe este modelo
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
    try {
      // Verificar dirección si se proporciona
      let address = null;
      if (address_id) {
        address = await Address.findOne({ where: { address_id, user_id: userId } });
        if (!address) {
          throw new Error('Dirección no válida');
        }
      }

      // Obtener carrito del usuario
      const cart = await Cart.findOne({
        where: { user_id: userId },
        include: [{ model: CouponUsage }]
      });

      if (!cart) {
        throw new Error('Carrito no encontrado');
      }

      // Obtener detalles del carrito por separado
      const cartDetails = await CartDetail.findAll({
        where: { cart_id: cart.cart_id },
        include: [
          {
            model: ProductVariant,
            include: [
              {
                model: Product,
                attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_days', 'urgent_delivery_cost']
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
        ]
      });

      if (!cartDetails || cartDetails.length === 0) {
        throw new Error('Carrito vacío');
      }

      // Asignar detalles al carrito para mantener la compatibilidad con el resto del código
      cart.CartDetails = cartDetails;

      // Determinar si la orden es urgente y calcular costo de envío
      let isUrgent = false;
      let shippingCost = 20.00; // Costo estándar por defecto
      for (const detail of cartDetails) {
        const product = detail.ProductVariant?.Product;
        if (product?.urgent_delivery_enabled && product?.urgent_delivery_days) {
          isUrgent = true;
          shippingCost = product.urgent_delivery_cost || 50.00; // Usar costo urgente del producto o 50.00
          break;
        }
      }

      // Calcular subtotal y descuentos
      let subtotal = 0;
      let discount = 0;
      const orderDetailsData = [];

      for (const detail of cart.CartDetails) {
        const unitPrice = detail.unit_price || detail.ProductVariant?.calculated_price;
        if (!unitPrice) {
          throw new Error(`Precio no definido para el ítem ${detail.product_name || detail.variant_id}`);
        }
        const itemSubtotal = detail.quantity * unitPrice;
        let itemDiscount = 0;

        // Calcular descuentos por promociones
        if (detail.ProductVariant?.Promotions && detail.ProductVariant.Promotions.length > 0) {
          itemDiscount = detail.ProductVariant.Promotions.reduce((sum, promo) => {
            if (promo.promotion_type === 'order_count_discount' && promo.is_applicable) {
              return sum + itemSubtotal * (promo.discount_value / 100);
            }
            return sum;
          }, 0);
        }

        subtotal += itemSubtotal;
        discount += itemDiscount;

        orderDetailsData.push({
          variant_id: detail.variant_id,
          option_id: detail.option_id,
          customization_id: detail.customization_id,
          quantity: detail.quantity,
          unit_price: unitPrice,
          subtotal: itemSubtotal,
          discount_applied: itemDiscount,
          unit_measure: detail.unit_measure || 1.00
        });
      }

      // Calcular total
      const total = Math.max(0, subtotal + shippingCost - discount);

      // Crear orden
      const order = await Order.create({
        user_id: userId,
        address_id: address_id || null,
        total,
        discount,
        shipping_cost: shippingCost,
        payment_status: 'pending',
        payment_method,
        order_status: 'pending'
      });

      // Crear detalles del pedido
      try {
        for (const detailData of orderDetailsData) {
          await OrderDetail.create({
            ...detailData,
            order_id: order.order_id
          });
        }
      } catch (error) {
        // Revertir orden si falla
        await Order.destroy({ where: { order_id: order.order_id } });
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
        });
      } catch (error) {
        // Revertir orden y detalles
        await OrderDetail.destroy({ where: { order_id: order.order_id } });
        await Order.destroy({ where: { order_id: order.order_id } });
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
        });
      } catch (error) {
        // Revertir historial, detalles y orden
        await OrderHistory.destroy({ where: { order_id: order.order_id } });
        await OrderDetail.destroy({ where: { order_id: order.order_id } });
        await Order.destroy({ where: { order_id: order.order_id } });
        throw new Error(`Error al añadir registro de pago: ${error.message}`);
      }

      // Manejar cupones
      if (coupon_code && cart.promotion_id) {
        try {
          const coupon = await CouponUsage.findOne({
            where: { user_id: userId, cart_id: cart.cart_id, promotion_id: cart.promotion_id }
          });
          if (coupon) {
            await CouponUsage.create({
              user_id: userId,
              order_id: order.order_id,
              promotion_id: cart.promotion_id,
              usage_date: new Date()
            });
          } else {
            throw new Error('Cupón no válido');
          }
        } catch (error) {
          // Revertir pago, historial, detalles y orden
          await Payment.destroy({ where: { order_id: order.order_id } });
          await OrderHistory.destroy({ where: { order_id: order.order_id } });
          await OrderDetail.destroy({ where: { order_id: order.order_id } });
          await Order.destroy({ where: { order_id: order.order_id } });
          throw new Error(`Error al procesar el cupón: ${error.message}`);
        }
      }

      // Limpiar carrito
      try {
        await CartDetail.destroy({ where: { cart_id: cart.cart_id } });
        await CouponUsage.destroy({ where: { cart_id: cart.cart_id } });
        await Cart.destroy({ where: { cart_id: cart.cart_id } });
      } catch (error) {
        // Revertir todo
        await CouponUsage.destroy({ where: { order_id: order.order_id } });
        await Payment.destroy({ where: { order_id: order.order_id } });
        await OrderHistory.destroy({ where: { order_id: order.order_id } });
        await OrderDetail.destroy({ where: { order_id: order.order_id } });
        await Order.destroy({ where: { order_id: order.order_id } });
        throw new Error(`Error al limpiar el carrito: ${error.message}`);
      }

      // Generar instrucciones de pago
      const paymentInstructions = this.generatePaymentInstructions(payment_method, total);

      loggerUtils.logUserActivity(userId, 'create_order', `Orden creada exitosamente: order_id ${order.order_id}`);

      return { order, payment, paymentInstructions };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al crear la orden: ${error.message}`);
    }
  }

  /**
   * Retrieves the details of a specific order for the authenticated user.
   * @param {number} userId - The ID of the authenticated user.
   * @param {number} orderId - The ID of the order to retrieve.
   * @returns {Object} - The order details including items, address, payment instructions, and status.
   * @throws {Error} - If the order is not found or does not belong to the user.
   */
  async getOrderById(userId, orderId) {
    try {
      const order = await Order.findOne({
        where: {
          order_id: orderId,
          user_id: userId
        },
        include: [
          {
            model: OrderDetail,
            attributes: ['order_detail_id', 'quantity', 'unit_price', 'subtotal', 'discount_applied', 'unit_measure'],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id', 'calculated_price'],
                include: [
                  {
                    model: Product,
                    attributes: ['name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'standard_delivery_days']
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
            attributes: ['address_id', 'street', 'city', 'state', 'postal_code'],
            required: false
          },
          {
            model: Payment,
            attributes: ['payment_id', 'payment_method', 'amount', 'status'],
            required: false
          }
        ]
      });

      if (!order) {
        throw new Error('Orden no encontrada o acceso denegado');
      }

      // Determinar si la orden es urgente
      let isUrgent = false;
      let deliveryDays = null;
      for (const detail of order.OrderDetails) {
        const product = detail.ProductVariant?.Product;
        if (product?.urgent_delivery_enabled && product?.urgent_delivery_days) {
          isUrgent = true;
          deliveryDays = product.urgent_delivery_days;
          break;
        } else if (product?.standard_delivery_days) {
          deliveryDays = deliveryDays ? Math.max(deliveryDays, product.standard_delivery_days) : product.standard_delivery_days;
        }
      }

      // Generar instrucciones de pago
      const paymentInstructions = this.generatePaymentInstructions(order.payment_method, order.total);

      // Formatear la respuesta
      const orderDetails = {
        order_id: order.order_id,
        user_id: order.user_id,
        total: order.total,
        subtotal: order.OrderDetails.reduce((sum, detail) => sum + detail.subtotal, 0),
        discount: order.discount,
        shipping_cost: order.shipping_cost,
        payment_method: order.payment_method,
        payment_status: Array.isArray(order.Payments) && order.Payments.length > 0 ? order.Payments[0].status : 'pending',
        order_status: order.order_status,
        is_urgent: isUrgent,
        delivery_days: deliveryDays,
        created_at: order.created_at,
        address: order.Address ? {
          address_id: order.Address.address_id,
          street: order.Address.street,
          city: order.Address.city,
          state: order.Address.state,
          postal_code: order.Address.postal_code
        } : null,
        items: order.OrderDetails.map(detail => ({
          order_detail_id: detail.order_detail_id,
          product_name: detail.ProductVariant?.Product?.name || 'Producto no disponible',
          quantity: detail.quantity,
          unit_price: detail.unit_price,
          subtotal: detail.subtotal,
          discount_applied: detail.discount_applied,
          unit_measure: detail.unit_measure,
          customization: detail.Customization ? {
            customization_id: detail.Customization.customization_id,
            content: detail.Customization.content,
            file_url: detail.Customization.file_url,
            comments: detail.Customization.comments
          } : null
        })),
        payment_instructions: paymentInstructions
      };

      return orderDetails;
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener los detalles de la orden: ${error.message}`);
    }
  }

  /**
   * Retrieves a paginated list of all orders for the authenticated user.
   * @param {number} userId - The ID of the authenticated user.
   * @param {number} page - The page number (default: 1).
   * @param {number} pageSize - The number of orders per page (default: 10).
   * @param {string} searchTerm - Optional search term to filter products by name.
   * @param {string} dateFilter - Optional year or date range (YYYY or YYYY-MM-DD,YYYY-MM-DD) to filter orders by creation date.
   * @returns {Object} - The list of orders and pagination metadata.
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
          // Caso de un año de 4 dígitos
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
          // Caso de rango de fechas (YYYY-MM-DD,YYYY-MM-DD)
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
          attributes: ['order_detail_id', 'quantity', 'subtotal', 'unit_measure', 'variant_id'],
          required: false,
          include: [
            {
              model: ProductVariant,
              attributes: ['variant_id'],
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

      // Add search condition to ensure orders have matching products
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
        ],
        include,
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
        subQuery: false,
      });

      // Debug log
      console.log(`Usuario ${userId}: ${count} órdenes contadas, ${rows.length} órdenes retornadas`);

      const orders = rows.map((order) => {
        // Determinar si la orden es urgente
        let isUrgent = false;
        let deliveryDays = null;
        for (const detail of order.OrderDetails || []) {
          const product = detail.ProductVariant?.Product;
          if (product?.urgent_delivery_enabled && product?.urgent_delivery_days) {
            isUrgent = true;
            deliveryDays = product.urgent_delivery_days;
            break;
          } else if (product?.standard_delivery_days) {
            deliveryDays = deliveryDays ? Math.max(deliveryDays, product.standard_delivery_days) : product.standard_delivery_days;
          }
        }

        return {
          order_id: order.order_id,
          total: parseFloat(order.total) || 0,
          order_status: order.order_status,
          payment_status: order.Payments?.[0]?.status || 'pending',
          created_at: order.created_at,
          total_items: order.OrderDetails?.reduce((sum, detail) => sum + (detail.quantity || 0), 0) || 0,
          product_names: order.OrderDetails?.map(
            (detail) => detail.ProductVariant?.Product?.name || 'Producto no disponible'
          ) || [],
          first_item_image:
            order.OrderDetails?.[0]?.ProductVariant?.ProductImages?.[0]?.image_url ||
            'https://via.placeholder.com/100?text=No+Image',
          is_urgent: isUrgent,
          delivery_days: deliveryDays
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