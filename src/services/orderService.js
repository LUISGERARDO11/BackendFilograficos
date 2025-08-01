require('dotenv').config();
const loggerUtils = require('../utils/loggerUtils');
const { Op, Sequelize } = require('sequelize');
const moment = require('moment-timezone');
const orderUtils = require('../utils/orderUtils');
const NotificationManager = require('./notificationManager');
const PromotionService = require('./PromotionService'); // Importar PromotionService
const mercadopago = require('../config/mercado-pago.config');

// Importar todos los modelos necesarios al inicio del archivo
const { Cart, CartDetail, Order, OrderDetail, OrderHistory, Payment, Address, CouponUsage, Promotion, Coupon, ProductVariant, Customization, Product, ProductImage, User, ShippingOption } = require('../models/Associations');

class OrderService {
  /**
   * Crea una orden a partir del carrito o un ítem único del usuario, aplica promociones/cupones, genera registros relacionados, actualiza el stock y limpia el carrito.
   * @param {number} userId - El ID del usuario autenticado.
   * @param {Object} orderData - Los datos de la orden incluyendo address_id, payment_method, coupon_code, delivery_option, y item (opcional).
   * @returns {Object} - La orden creada, el pago y las instrucciones de pago.
   * @throws {Error} - Si el carrito está vacío, la dirección es inválida, el stock es insuficiente o falla alguna operación.
   */
  async createOrder(userId, { address_id, payment_method, coupon_code, delivery_option, item = null }) {
    const transaction = await Cart.sequelize.transaction();
    try {
      // Validar dirección
      let address = null;
      if (delivery_option === 'Entrega a Domicilio' && !address_id) {
        throw new Error('La dirección es obligatoria para Entrega a Domicilio');
      }
      if (address_id) {
        address = await Address.findOne({ where: { address_id, user_id: userId }, transaction });
        if (!address) {
          throw new Error('Dirección no válida');
        }
      }

      // Inicializar PromotionService
      const promotionService = new PromotionService();

      // Procesar ítems (carrito o ítem único)
      let orderDetailsData = [];
      let cart = null;
      let cartId = null;

      if (item) {
        // Validar ítem único
        if (!item.variant_id || !item.quantity) {
          throw new Error('Ítem no válido o incompleto');
        }
        const variant = await ProductVariant.findOne({
          where: { variant_id: item.variant_id },
          include: [
            {
              model: Product,
              attributes: ['product_id', 'name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'urgent_delivery_cost', 'standard_delivery_days', 'category_id'],
              required: false
            }
          ],
          transaction
        });
        if (!variant || !variant.Product) {
          throw new Error(`Variante o producto no encontrado para el ítem ${item.variant_id}`);
        }
        if (item.is_urgent && !variant.Product.urgent_delivery_enabled) {
          throw new Error(`El producto ${variant.Product.name || 'desconocido'} no permite entrega urgente`);
        }
        if (variant.stock < item.quantity) {
          throw new Error(`Stock insuficiente para el producto ${variant.Product.name || 'desconocido'} (SKU: ${variant.sku}). Disponible: ${variant.stock}, Requerido: ${item.quantity}`);
        }
        const unitPrice = item.unit_price || variant.calculated_price;
        if (!unitPrice) {
          throw new Error(`Precio no definido para el ítem ${variant.Product?.name || `Producto ID ${item.variant_id}`}`);
        }
        const urgentCost = item.is_urgent ? parseFloat(variant.Product.urgent_delivery_cost || 0) : 0;
        orderDetailsData.push({
          variant_id: item.variant_id,
          option_id: item.option_id || null,
          customization_id: item.customization_id || null,
          quantity: item.quantity,
          unit_price: unitPrice,
          subtotal: item.quantity * unitPrice,
          discount_applied: 0,
          unit_measure: item.unit_measure || 1.00,
          is_urgent: item.is_urgent || false,
          additional_cost: urgentCost,
          category_id: variant.Product?.category_id || null,
          Product: variant.Product
        });
      } else {
        // Obtener carrito
        cart = await Cart.findOne({
          where: { user_id: userId },
          include: [{ model: CouponUsage }],
          transaction
        });
        if (!cart) {
          throw new Error('Carrito no encontrado');
        }
        cartId = cart.cart_id;
        const cartDetails = await CartDetail.findAll({
          where: { cart_id: cart.cart_id },
          include: [
            {
              model: ProductVariant,
              include: [
                {
                  model: Product,
                  attributes: ['product_id', 'name', 'urgent_delivery_enabled', 'urgent_delivery_days', 'urgent_delivery_cost', 'standard_delivery_days', 'category_id'],
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
        for (const detail of cartDetails) {
          const variant = detail.ProductVariant;
          const product = Array.isArray(variant.Product) ? variant.Product[0] : variant.Product;
          if (!variant || !product) {
            throw new Error(`Variante o producto no encontrado para el ítem ${detail.variant_id}`);
          }
          if (detail.is_urgent && !product.urgent_delivery_enabled) {
            throw new Error(`El producto ${product.name || 'desconocido'} no permite entrega urgente`);
          }
          if (variant.stock < detail.quantity) {
            throw new Error(`Stock insuficiente para el producto ${product.name || 'desconocido'} (SKU: ${variant.sku}). Disponible: ${variant.stock}, Requerido: ${detail.quantity}`);
          }
          const unitPrice = detail.unit_price || variant.calculated_price;
          if (!unitPrice) {
            throw new Error(`Precio no definido para el ítem ${product?.name || `Producto ID ${detail.variant_id}`}`);
          }
          const urgentCost = detail.is_urgent ? parseFloat(detail.urgent_delivery_fee || product.urgent_delivery_cost || 0) : 0;
          orderDetailsData.push({
            variant_id: detail.variant_id,
            option_id: detail.option_id,
            customization_id: detail.customization_id,
            quantity: detail.quantity,
            unit_price: unitPrice,
            subtotal: detail.quantity * unitPrice,
            discount_applied: 0,
            unit_measure: detail.unit_measure || 1.00,
            is_urgent: detail.is_urgent,
            additional_cost: urgentCost,
            category_id: product.category_id || null,
            Product: product
          });
        }
      }

      // Aplicar promociones/cupones
      const applicablePromotions = await promotionService.getApplicablePromotions(orderDetailsData, userId, coupon_code);
      const { updatedOrderDetails, totalDiscount, shippingCost } = await promotionService.applyPromotions(
        orderDetailsData,
        applicablePromotions,
        userId,
        cartId || null,
        coupon_code
      );

      // Actualizar orderDetailsData con descuentos aplicados
      orderDetailsData = updatedOrderDetails;

      // Calcular costos y días de entrega
      let total_urgent_cost = 0;
      let maxDeliveryDays = 0;
      for (const detail of orderDetailsData) {
        total_urgent_cost += detail.additional_cost * detail.quantity;
        const deliveryDays = detail.is_urgent ? (detail.Product?.urgent_delivery_days || 0) : (detail.Product?.standard_delivery_days || 0);
        maxDeliveryDays = Math.max(maxDeliveryDays, deliveryDays);
      }

      // Calcular subtotal, descuento y total
      const subtotal = orderDetailsData.reduce((sum, detail) => sum + (detail.quantity * detail.unit_price), 0);
      const discount = totalDiscount; // Usar el descuento calculado por PromotionService
      let calculatedShippingCost = shippingCost; // Usar el costo de envío calculado por PromotionService
      if (delivery_option && calculatedShippingCost === 0) {
        const shippingOption = await ShippingOption.findOne({ where: { name: delivery_option, status: 'active' }, transaction });
        if (!shippingOption) {
          throw new Error('Opción de envío no válida o inactiva');
        }
        calculatedShippingCost = applicablePromotions.some(p => p.coupon_type === 'free_shipping' && p.free_shipping_enabled)
          ? 0
          : parseFloat(shippingOption.base_cost);
      }
      const total = Math.max(0, subtotal + calculatedShippingCost + total_urgent_cost - discount);
      const estimated_delivery_date = moment().add(maxDeliveryDays, 'days').toDate();

      // Crear orden
      const order = await Order.create({
        user_id: userId,
        address_id: address_id || null,
        total,
        total_urgent_cost,
        discount,
        shipping_cost: calculatedShippingCost,
        payment_status: 'pending',
        payment_method,
        order_status: 'pending',
        estimated_delivery_date,
        delivery_option: delivery_option || null,
        coupon_code: coupon_code || null // Almacenar el código de cupón en la orden
      }, { transaction });

      // Crear detalles del pedido
      for (const detailData of orderDetailsData) {
        await OrderDetail.create({
          ...detailData,
          order_id: order.order_id,
          subtotal: (detailData.quantity * detailData.unit_price) + detailData.additional_cost
        }, { transaction });
      }

      // Actualizar stock
      for (const detail of orderDetailsData) {
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

      // Generar preferencia de Mercado Pago
      const preference = {
        items: [
          ...orderDetailsData.map(detail => ({
            title: detail.Product?.name || `Producto ID ${detail.variant_id}`,
            unit_price: parseFloat(detail.unit_price),
            quantity: detail.quantity,
            currency_id: 'MXN'
          })),
          {
            title: 'Costo de envío',
            unit_price: calculatedShippingCost,
            quantity: 1,
            currency_id: 'MXN'
          }
        ],
        back_urls: {
          success: 'https://ecommerce-filograficos.vercel.app/payment-callback?status=success',
          failure: 'https://ecommerce-filograficos.vercel.app/payment-callback?status=failure',
          pending: 'https://ecommerce-filograficos.vercel.app/payment-callback?status=pending'
        },
        auto_return: 'approved',
        external_reference: order.order_id.toString(),
        notification_url: 'https://backend-filograficos.vercel.app/api/order/webhook/mercado-pago'
      };
      const mpResponse = await mercadopago.preferences.create(preference);
      const preferenceId = mpResponse.body.id;
      const paymentUrl = mpResponse.body.init_point;

      // Actualizar payment con preference_id
      await payment.update({ preference_id: preferenceId }, { transaction });

      // Limpiar carrito si se usó
      if (!item && cart) {
        await CartDetail.destroy({ where: { cart_id: cart.cart_id }, transaction });
        await CouponUsage.destroy({ where: { cart_id: cart.cart_id }, transaction });
        await Cart.destroy({ where: { cart_id: cart.cart_id }, transaction });
      }

      await transaction.commit();

      // Obtener detalles de la orden
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

      this.notifyOrderCreation(order, user, orderDetails, payment).catch(err => {
        loggerUtils.logCriticalError(err, 'Error al enviar notificación asíncrona');
      });

      const paymentInstructions = {
        preference_id: preferenceId,
        payment_url: paymentUrl
      };

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
          'payment_status',
          'created_at',
          'discount',
          'shipping_cost',
          'estimated_delivery_date',
          'delivery_option',
          'coupon_code'
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
          },
          {
            model: CouponUsage,
            attributes: ['promotion_id', 'coupon_id', 'applied_at'],
            include: [
              {
                model: Coupon,
                attributes: ['code']
              },
              {
                model: Promotion,
                attributes: ['name', 'coupon_type', 'discount_value']
              }
            ],
            required: false
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
          payment_status: order.payment_status,
          created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
          delivery_days: deliveryDays,
          delivery_option: order.delivery_option || null,
          total: parseFloat(order.total) || 0,
          subtotal: order.OrderDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal || 0), 0),
          discount: parseFloat(order.discount) || 0,
          shipping_cost: parseFloat(order.shipping_cost) || 0,
          coupon_code: order.coupon_code || null
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
          status: order.Payments?.[0]?.status || order.payment_status,
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
        })) || [],
        coupon: order.CouponUsages?.[0] ? {
          coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
          promotion_name: order.CouponUsages[0].Promotion?.name || null,
          coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
          discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
          applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null
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
        {
          model: CouponUsage,
          attributes: ['promotion_id', 'coupon_id', 'applied_at'],
          include: [
            {
              model: Coupon,
              attributes: ['code']
            },
            {
              model: Promotion,
              attributes: ['name', 'coupon_type', 'discount_value']
            }
          ],
          required: false
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
          'coupon_code'
        ],
        include,
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
        subQuery: false,
      });

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
          coupon_code: order.coupon_code || null,
          coupon: order.CouponUsages?.[0] ? {
            coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
            promotion_name: order.CouponUsages[0].Promotion?.name || null,
            coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
            discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
            applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
          } : null,
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
   * @returns {Array} - Lista de órdenes formateadas para la fecha especificada.
   * @throws {Error} - Si la fecha es inválida o hay un error en la consulta.
   */
  async getOrdersByDateForAdmin(date, dateField) {
    try {
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
          'coupon_code'
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
          {
            model: CouponUsage,
            attributes: ['promotion_id', 'coupon_id', 'applied_at'],
            include: [
              {
                model: Coupon,
                attributes: ['code']
              },
              {
                model: Promotion,
                attributes: ['name', 'coupon_type', 'discount_value']
              }
            ],
            required: false
          },
        ],
        order: [[field, 'DESC']],
      });

      return orders.map(order => ({
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        coupon_code: order.coupon_code || null,
        coupon: order.CouponUsages?.[0] ? {
          coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
          promotion_name: order.CouponUsages[0].Promotion?.name || null,
          coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
          discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
          applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
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
   * Obtiene un resumen global de estadísticas de órdenes para Alexa.
   * @param {string} statusFilter - Filtro de estado ('all', 'pending', 'processing', 'shipped', 'delivered').
   * @param {string} dateFilter - Año, fecha única o rango de fechas (YYYY, YYYY-MM-DD, o YYYY-MM-DD,YYYY-MM-DD).
   * @param {string} dateField - Campo de fecha a filtrar ('delivery' o 'creation').
   * @returns {Object} - Resumen de estadísticas (total, monto total, conteos por estado).
   * @throws {Error} - Si hay un error al obtener el resumen.
   */
  async getOrderSummaryForAlexa(statusFilter = 'all', dateFilter = '', dateField = 'delivery') {
    try {
      const validStatuses = ['pending', 'processing', 'shipped', 'delivered'];
      const field = dateField === 'delivery' ? 'estimated_delivery_date' : 'created_at';

      // Determinar el rango de fechas predeterminado (lunes de la semana actual hasta hoy)
      let effectiveDateFilter = dateFilter;
      if (!dateFilter) {
        const today = moment.tz('America/Mexico_City');
        const startOfWeek = today.clone().startOf('isoWeek'); // Lunes de la semana actual
        const endOfDay = today.clone().endOf('day'); // Fin del día actual
        effectiveDateFilter = `${startOfWeek.format('YYYY-MM-DD')},${endOfDay.format('YYYY-MM-DD')}`;
      }

      const dateCondition = orderUtils.buildDateCondition(effectiveDateFilter, field);

      let where = {};
      if (statusFilter !== 'all' && orderUtils.isValidOrderStatus(statusFilter)) {
        where.order_status = statusFilter;
      } else {
        where.order_status = { [Op.in]: validStatuses };
      }
      where = { ...where, ...dateCondition };

      const result = await Order.findAll({
        where,
        attributes: [
          [Sequelize.fn('COUNT', Sequelize.col('order_id')), 'total'],
          [Sequelize.fn('SUM', Sequelize.cast(Sequelize.col('total'), 'FLOAT')), 'total_amount'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'pending' THEN 1 END")), 'pending'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'processing' THEN 1 END")), 'processing'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'shipped' THEN 1 END")), 'shipped'],
          [Sequelize.fn('COUNT', Sequelize.literal("CASE WHEN order_status = 'delivered' THEN 1 END")), 'delivered']
        ],
        raw: true
      });

      return {
        total: parseInt(result[0].total) || 0,
        total_amount: parseFloat(result[0].total_amount) || 0,
        pending: parseInt(result[0].pending) || 0,
        processing: parseInt(result[0].processing) || 0,
        shipped: parseInt(result[0].shipped) || 0,
        delivered: parseInt(result[0].delivered) || 0
      };
    } catch (error) {
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al obtener el resumen de órdenes para Alexa: ${error.message}`);
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
   * @param {string} paymentMethod - Filtro opcional por método de pago.
   * @param {string} deliveryOption - Filtro opcional por opción de entrega.
   * @param {number} minTotal - Filtro opcional por total mínimo.
   * @param {number} maxTotal - Filtro opcional por total máximo.
   * @param {boolean} isUrgent - Filtro opcional por órdenes urgentes.
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
        {
          model: CouponUsage,
          attributes: ['promotion_id', 'coupon_id', 'applied_at'],
          include: [
            {
              model: Coupon,
              attributes: ['code']
            },
            {
              model: Promotion,
              attributes: ['name', 'coupon_type', 'discount_value']
            }
          ],
          required: false
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
          'coupon_code',
          [Sequelize.fn('DATE', Sequelize.col(`Order.${field}`)), 'order_date'],
        ],
        include,
        order: [[field, 'DESC']],
        limit: pageSize,
        offset,
        distinct: true,
        subQuery: false,
      });
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
      const ordersFormatted = rows.map(order => ({
        ...orderUtils.formatOrderDetails(order),
        created_at: moment(order.created_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        estimated_delivery_date: moment(order.estimated_delivery_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        coupon_code: order.coupon_code || null,
        coupon: order.CouponUsages?.[0] ? {
          coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
          promotion_name: order.CouponUsages[0].Promotion?.name || null,
          coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
          discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
          applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
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
          'coupon_code'
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
          {
            model: CouponUsage,
            attributes: ['promotion_id', 'coupon_id', 'applied_at'],
            include: [
              {
                model: Coupon,
                attributes: ['code']
              },
              {
                model: Promotion,
                attributes: ['name', 'coupon_type', 'discount_value']
              }
            ],
            required: false
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
        coupon_code: order.coupon_code || null,
        coupon: order.CouponUsages?.[0] ? {
          coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
          promotion_name: order.CouponUsages[0].Promotion?.name || null,
          coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
          discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
          applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null,
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
   * @param {string} paymentStatus - El nuevo estado del pago (opcional).
   * @returns {Object} - La orden actualizada.
   * @throws {Error} - Si el estado es inválido o la orden no se encuentra.
   */
  async updateOrderStatus(orderId, newStatus, adminId = null, paymentStatus = null) {
    const transaction = await Order.sequelize.transaction();
    try {
      if (!orderUtils.isValidOrderStatus(newStatus)) {
        throw new Error('Estado de orden inválido');
      }

      // Validar que adminId pertenece a un administrador
      if (adminId) {
        const admin = await User.findOne({
          where: { user_id: adminId, user_type: 'administrador' },
          transaction,
        });
        if (!admin) {
          throw new Error('Usuario administrador no válido');
        }
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
          'coupon_code'
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
          {
            model: CouponUsage,
            attributes: ['promotion_id', 'coupon_id', 'applied_at'],
            include: [
              {
                model: Coupon,
                attributes: ['code']
              },
              {
                model: Promotion,
                attributes: ['name', 'coupon_type', 'discount_value']
              }
            ],
            required: false
          },
        ],
        transaction,
      });

      if (!order) {
        throw new Error('Orden no encontrada');
      }

      // Actualizar el estado de la orden
      await order.update({
        order_status: newStatus,
        ...(paymentStatus && { payment_status: paymentStatus })
      }, { transaction });

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
      if (paymentStatus) order.payment_status = paymentStatus;

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

      // Devolver la orden formateada
      return {
        ...orderUtils.formatOrderDetails(order),
        coupon_code: order.coupon_code || null,
        coupon: order.CouponUsages?.[0] ? {
          coupon_code: order.CouponUsages[0].Coupon?.code || order.coupon_code,
          promotion_name: order.CouponUsages[0].Promotion?.name || null,
          coupon_type: order.CouponUsages[0].Promotion?.coupon_type || null,
          discount_value: parseFloat(order.CouponUsages[0].Promotion?.discount_value) || 0,
          applied_at: moment(order.CouponUsages[0].applied_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
        } : null
      };
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al actualizar el estado de la orden: ${error.message}`);
    }
  }

  /**
   * Actualiza el estado de un pago.
   * @param {number} orderId - El ID de la orden asociada al pago.
   * @param {string} newStatus - El nuevo estado del pago.
   * @returns {void}
   * @throws {Error} - Si hay un error al actualizar el estado del pago.
   */
  async updatePaymentStatus(orderId, newStatus) {
    const transaction = await Payment.sequelize.transaction();
    try {
      const payment = await Payment.findOne({ where: { order_id: orderId }, transaction });
      if (payment) {
        await payment.update({ status: newStatus }, { transaction });
      }
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      throw new Error(`Error al actualizar el estado del pago: ${error.message}`);
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
      case 'mercado_pago':
        return {
          method: 'Mercado Pago',
          amount,
          instructions: 'Serás redirigido a Mercado Pago para completar el pago.'
        };
      default:
        return {
          method: 'Unknown',
          amount,
          instructions: 'Método de pago no soportado.'
        };
    }
  }
}

module.exports = OrderService;