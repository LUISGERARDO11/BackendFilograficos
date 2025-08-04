const { Sequelize, Op } = require('sequelize');
const { Order, OrderDetail, Product, ProductVariant, User, Address, Coupon, ShippingOption, Promotion, OrderHistory, Payment } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Controlador para exportar transacciones a CSV
exports.exportTransactions = async (req, res) => {
  try {
    // Obtener todas las órdenes con sus detalles y nombres de productos
    const orders = await Order.findAll({
      attributes: ['order_id'],
      include: [
        {
          model: OrderDetail,
          attributes: ['variant_id', 'quantity'],
          include: [
            {
              model: ProductVariant,
              attributes: ['variant_id'],
              include: [
                {
                  model: Product,
                  attributes: ['name'],
                },
              ],
            },
          ],
        },
      ],
    });

    // Agrupar por orden
    const transactionsMap = new Map();

    orders.forEach((order) => {
      const orderId = order.order_id;
      const productNames = order.OrderDetails.map((detail) =>
        detail.ProductVariant.Product.name
      );
      if (productNames.length > 0) {
        transactionsMap.set(orderId, productNames);
      }
    });

    // Crear las líneas CSV
    const lines = [];
    for (const products of transactionsMap.values()) {
      const line = products.join(',');
      lines.push(line);
    }

    // Generar el contenido del CSV
    const csvContent = lines.join('\n');

    // Configurar la respuesta para descargar el archivo
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transaccionesFilograficos.csv');
    res.status(200).send(csvContent);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al exportar transacciones', error: error.message });
  }
};

// Controlador para generar órdenes automáticamente
exports.generateOrders = async (req, res) => {
  const t = await Order.sequelize.transaction();
  try {
    // Definir los order_id específicos
    const orderIds = [
      4, 49, 62, 68, 162, 174, 189, 211, 245, 264, 292, 380, 400, 437, 483, 484, 489,
      501, 502, 503, 504, 505, 506, 507, 508, 509, 510, 511, 532, 677, 718, 725, 741,
      752, 807, 862, 878, 885, 915, 935, 949, 954, 966, 997, 1012, 1013, 1014, 1015,
      1016, 1017, 1018, 1019, 1020, 1021, 1022
    ];

    // Obtener usuarios activos no administrativos
    const eligibleUsers = await User.findAll({
      where: {
        user_type: 'cliente',
        status: 'activo',
      },
      include: [
        {
          model: Address,
          required: false, // LEFT JOIN
          attributes: ['address_id'],
        },
      ],
      attributes: ['user_id'],
      transaction: t,
    });

    if (!eligibleUsers.length) {
      throw new Error('No se encontraron usuarios activos');
    }

    // Obtener variantes de productos disponibles
    const validVariants = await ProductVariant.findAll({
      where: {
        is_deleted: false,
        stock: { [Op.gt]: 0 },
      },
      include: [
        {
          model: Product,
          attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_cost'],
        },
      ],
      attributes: ['variant_id', 'product_id', 'calculated_price', 'stock'],
      transaction: t,
    });

    if (!validVariants.length) {
      throw new Error('No se encontraron variantes de productos disponibles');
    }

    // Obtener cupones activos con su descuento desde promotions
    const validCoupons = await Coupon.findAll({
      where: {
        status: 'active',
      },
      include: [
        {
          model: Promotion,
          attributes: ['discount_value', 'coupon_type'],
          where: {
            status: 'active',
            end_date: { [Op.gt]: new Date() },
          },
        },
      ],
      attributes: ['code', 'promotion_id'],
      transaction: t,
    });

    // Obtener costo de envío para 'Entrega a Domicilio'
    const shippingOption = await ShippingOption.findOne({
      where: { name: 'Entrega a Domicilio', status: 'active' },
      attributes: ['base_cost'],
      transaction: t,
    });

    const defaultShippingCost = 50.00; // Valor por defecto si no hay shipping_option
    const shippingCost = shippingOption ? Number(shippingOption.base_cost) || defaultShippingCost : defaultShippingCost;

    const orderDetails = [];
    const orders = [];

    // Generar datos para cada orden
    for (const orderId of orderIds) {
      const user = eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
      const deliveryOptions = ['Entrega a Domicilio', 'Puntos de Entrega', 'Recoger en Tienda'];
      const deliveryOption = deliveryOptions[Math.floor(Math.random() * deliveryOptions.length)];
      const address = deliveryOption === 'Entrega a Domicilio' && user.Addresses && user.Addresses.length > 0 
        ? user.Addresses[0] 
        : null;

      const numDetails = Math.floor(Math.random() * 5) + 1; // 1-5 detalles
      let total = 0;
      let totalUrgentCost = 0;
      let discount = 0;
      const coupon = Math.random() > 0.7 && validCoupons.length ? validCoupons[Math.floor(Math.random() * validCoupons.length)] : null;

      let finalShippingCost = deliveryOption === 'Entrega a Domicilio' ? (numDetails > 3 ? 80.00 : numDetails > 1 ? 60.00 : shippingCost) : 0;

      // Ajustar costo de envío si el cupón es de tipo free_shipping
      if (coupon && coupon.Promotion && coupon.Promotion.coupon_type === 'free_shipping') {
        finalShippingCost = 0;
      }

      const detailsForOrder = [];

      // Generar detalles de la orden
      for (let i = 0; i < numDetails; i++) {
        const variant = validVariants[Math.floor(Math.random() * validVariants.length)];
        if (variant.stock < 1) {
          loggerUtils.logCriticalError(new Error(`No stock for variant_id: ${variant.variant_id}`));
          continue; // Saltar si no hay stock
        }

        const quantity = Math.min(Math.floor(Math.random() * 10) + 1, variant.stock);
        const isUrgent = variant.Product.urgent_delivery_enabled && Math.random() > 0.7;
        const calculatedPrice = Number(variant.calculated_price) || 0;
        const additionalCost = isUrgent ? (Number(variant.Product.urgent_delivery_cost) || 0) : 0;

        if (Number.isNaN(calculatedPrice) || Number.isNaN(additionalCost)) {
          loggerUtils.logCriticalError(new Error(`Invalid price for variant_id: ${variant.variant_id}, calculated_price: ${variant.calculated_price}, urgent_delivery_cost: ${variant.Product.urgent_delivery_cost}`));
          continue;
        }

        const subtotal = Number((quantity * calculatedPrice + additionalCost).toFixed(2));

        detailsForOrder.push({
          order_id: orderId,
          variant_id: variant.variant_id,
          option_id: null, // No customizations
          customization_id: null, // No customizations
          quantity,
          unit_price: calculatedPrice,
          subtotal,
          unit_measure: 1.00,
          discount_applied: 0.00, // Se actualizará después
          is_urgent: isUrgent,
          additional_cost: additionalCost,
        });

        total += subtotal;
        totalUrgentCost += additionalCost;
      }

      // Saltar si no hay detalles válidos
      if (detailsForOrder.length === 0) {
        loggerUtils.logCriticalError(new Error(`No valid order details for order_id: ${orderId}`));
        continue;
      }

      // Aplicar descuento si hay cupón
      if (coupon && coupon.Promotion && coupon.Promotion.discount_value) {
        const discountValue = Number(coupon.Promotion.discount_value) || 0;
        if (coupon.Promotion.coupon_type === 'percentage_discount') {
          discount = Number((total * (discountValue / 100)).toFixed(2));
        } else if (coupon.Promotion.coupon_type === 'fixed_discount') {
          discount = Number(discountValue.toFixed(2));
        }
        total -= discount;
      }

      // Verificar que total sea un número válido
      if (Number.isNaN(total) || Number.isNaN(totalUrgentCost) || Number.isNaN(finalShippingCost)) {
        loggerUtils.logCriticalError(new Error(`Invalid total calculation for order_id: ${orderId}, total: ${total}, totalUrgentCost: ${totalUrgentCost}, finalShippingCost: ${finalShippingCost}`));
        continue;
      }

      // Crear orden
      orders.push({
        order_id: orderId,
        user_id: user.user_id,
        address_id: address ? address.address_id : null,
        coupon_code: coupon ? coupon.code : null,
        total: Number((total + finalShippingCost + totalUrgentCost).toFixed(2)),
        discount: Number(discount.toFixed(2)),
        shipping_cost: Number(finalShippingCost.toFixed(2)),
        payment_status: ['pending', 'validated', 'approved'][Math.floor(Math.random() * 3)],
        payment_method: 'mercado_pago',
        order_status: ['pending', 'processing', 'shipped', 'delivered'][Math.floor(Math.random() * 4)],
        estimated_delivery_date: new Date(Date.now() + (Math.floor(Math.random() * 5) + 4) * 24 * 60 * 60 * 1000),
        total_urgent_cost: Number(totalUrgentCost.toFixed(2)),
        delivery_option: deliveryOption,
        created_at: new Date('2025-08-04T00:35:36.000Z'),
        updated_at: new Date('2025-08-04T00:35:36.000Z'),
      });

      orderDetails.push(...detailsForOrder);
    }

    // Insertar orders primero
    await Order.bulkCreate(orders, { transaction: t, updateOnDuplicate: ['order_id'] });

    // Insertar order_details
    await OrderDetail.bulkCreate(orderDetails, { transaction: t });

    // Actualizar descuentos en order_details
    for (const order of orders) {
      if (order.discount > 0) {
        const details = orderDetails.filter((d) => d.order_id === order.order_id);
        const totalSubtotal = details.reduce((sum, d) => sum + d.subtotal, 0);
        if (Number.isNaN(totalSubtotal) || totalSubtotal === 0) {
          loggerUtils.logCriticalError(new Error(`Invalid totalSubtotal for order_id: ${order.order_id}, totalSubtotal: ${totalSubtotal}`));
          continue;
        }
        for (const detail of details) {
          const discountShare = Number(((detail.subtotal / totalSubtotal) * order.discount).toFixed(2));
          await OrderDetail.update(
            { discount_applied: discountShare },
            { where: { order_id: order.order_id, variant_id: detail.variant_id }, transaction: t }
          );
        }
      }
    }

    await t.commit();
    res.status(201).json({ message: `${orders.length} órdenes generadas exitosamente` });
  } catch (error) {
    await t.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al generar órdenes', error: error.message });
  }
};

// Controlador para generar registros faltantes en órdenes
exports.fillMissingRecords = async (req, res) => {
  const t = await Order.sequelize.transaction();
  try {
    // Obtener órdenes con registros faltantes en order_details, order_history o payments
    const ordersWithMissingRecords = await Order.findAll({
      attributes: ['order_id'],
      include: [
        {
          model: OrderDetail,
          attributes: [],
          required: false,
        },
        {
          model: OrderHistory,
          attributes: [],
          required: false,
        },
        {
          model: Payment,
          attributes: [],
          required: false,
        },
      ],
      where: {
        [Op.or]: [
          Sequelize.literal('`OrderDetails`.`order_detail_id` IS NULL'),
          Sequelize.literal('`OrderHistories`.`history_id` IS NULL'),
          Sequelize.literal('`Payment`.`payment_id` IS NULL'),
        ],
      },
      group: ['Order.order_id'],
      transaction: t,
    });

    if (!ordersWithMissingRecords.length) {
      await t.commit();
      return res.status(200).json({ message: 'No se encontraron órdenes con registros faltantes' });
    }

    // Obtener usuarios activos no administrativos
    const eligibleUsers = await User.findAll({
      where: {
        user_type: 'cliente',
        status: 'activo',
      },
      include: [
        {
          model: Address,
          required: false, // LEFT JOIN
          attributes: ['address_id'],
        },
      ],
      attributes: ['user_id'],
      transaction: t,
    });

    if (!eligibleUsers.length) {
      throw new Error('No se encontraron usuarios activos');
    }

    // Obtener variantes de productos disponibles
    const validVariants = await ProductVariant.findAll({
      where: {
        is_deleted: false,
        stock: { [Op.gt]: 0 },
      },
      include: [
        {
          model: Product,
          attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_cost'],
        },
      ],
      attributes: ['variant_id', 'product_id', 'calculated_price', 'stock'],
      transaction: t,
    });

    if (!validVariants.length) {
      throw new Error('No se encontraron variantes de productos disponibles');
    }

    // Obtener cupones activos con su descuento desde promotions
    const validCoupons = await Coupon.findAll({
      where: {
        status: 'active',
      },
      include: [
        {
          model: Promotion,
          attributes: ['discount_value', 'coupon_type'],
          where: {
            status: 'active',
            end_date: { [Op.gt]: new Date() },
          },
        },
      ],
      attributes: ['code', 'promotion_id'],
      transaction: t,
    });

    const orderDetailsToCreate = [];
    const orderHistoriesToCreate = [];
    const paymentsToCreate = [];
    const ordersToUpdate = [];

    for (const order of ordersWithMissingRecords) {
      const fullOrder = await Order.findByPk(order.order_id, {
        include: [
          { model: OrderDetail, attributes: ['order_detail_id'] },
          { model: OrderHistory, attributes: ['history_id'] },
          { model: Payment, attributes: ['payment_id'] },
          { model: Coupon, attributes: ['code'], include: [{ model: Promotion, attributes: ['discount_value', 'coupon_type'] }] },
        ],
        transaction: t,
      });

      // Si la orden no existe, asignar un usuario y delivery_option
      const user = fullOrder && fullOrder.user_id 
        ? { user_id: fullOrder.user_id } 
        : eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
      const deliveryOptions = ['Entrega a Domicilio', 'Puntos de Entrega', 'Recoger en Tienda'];
      const deliveryOption = fullOrder && fullOrder.delivery_option 
        ? fullOrder.delivery_option 
        : deliveryOptions[Math.floor(Math.random() * deliveryOptions.length)];
      const address = deliveryOption === 'Entrega a Domicilio' && user.Addresses && user.Addresses.length > 0 
        ? user.Addresses[0] 
        : null;

      let needsUpdate = false;
      let newTotal = fullOrder ? Number(fullOrder.total) : 0;
      let newDiscount = fullOrder ? Number(fullOrder.discount) : 0;
      let newShippingCost = fullOrder ? Number(fullOrder.shipping_cost) : 0;
      let newTotalUrgentCost = fullOrder ? Number(fullOrder.total_urgent_cost) : 0;

      // Definir coupon al inicio
      const coupon = fullOrder && fullOrder.coupon_code 
        ? fullOrder.Coupon 
        : (Math.random() > 0.7 && validCoupons.length ? validCoupons[Math.floor(Math.random() * validCoupons.length)] : null);

      // Generar OrderDetails si faltan
      if (!fullOrder || !fullOrder.OrderDetails || fullOrder.OrderDetails.length === 0) {
        const numDetails = Math.floor(Math.random() * 3) + 1; // 1-3 detalles
        let totalSubtotal = 0;
        const detailsForOrder = [];

        for (let i = 0; i < numDetails; i++) {
          const variant = validVariants[Math.floor(Math.random() * validVariants.length)];
          if (variant.stock < 1) {
            loggerUtils.logCriticalError(new Error(`No stock for variant_id: ${variant.variant_id}`));
            continue;
          }

          const quantity = Math.min(Math.floor(Math.random() * 3) + 1, variant.stock);
          const isUrgent = variant.Product.urgent_delivery_enabled && Math.random() > 0.7;
          const unitPrice = Number(variant.calculated_price) || 0;

          if (!unitPrice || Number.isNaN(unitPrice)) {
            loggerUtils.logCriticalError(new Error(`Invalid price for variant_id: ${variant.variant_id}, calculated_price: ${variant.calculated_price}`));
            continue;
          }
          const additionalCost = isUrgent ? (Number(variant.Product.urgent_delivery_cost) || 0) : 0;

          if (Number.isNaN(additionalCost)) {
            loggerUtils.logCriticalError(new Error(`Invalid urgent delivery cost for variant_id: ${variant.variant_id}, urgent_delivery_cost: ${variant.Product.urgent_delivery_cost}`));
            continue;
          }

          const subtotal = Number((quantity * unitPrice + additionalCost).toFixed(2));

          detailsForOrder.push({
            order_id: order.order_id,
            variant_id: variant.variant_id,
            option_id: null,
            customization_id: null,
            quantity,
            unit_price: unitPrice,
            subtotal,
            unit_measure: 1.00,
            discount_applied: 0.00,
            is_urgent: isUrgent,
            additional_cost: additionalCost,
          });

          totalSubtotal += subtotal;
          newTotalUrgentCost += additionalCost;
        }

        if (detailsForOrder.length === 0) {
          loggerUtils.logCriticalError(new Error(`No valid order details for order_id: ${order.order_id}`));
          continue;
        }

        // Recalcular descuentos si hay cupón
        if (coupon && coupon.Promotion && coupon.Promotion.discount_value) {
          const discountValue = Number(coupon.Promotion.discount_value) || 0;
          if (coupon.Promotion.coupon_type === 'percentage_discount') {
            newDiscount = Number((totalSubtotal * (discountValue / 100)).toFixed(2));
          } else if (coupon.Promotion.coupon_type === 'fixed_discount') {
            newDiscount = Number(discountValue.toFixed(2));
          } else if (coupon.Promotion.coupon_type === 'free_shipping') {
            newShippingCost = 0;
          }
        }

        // Ajustar shipping_cost según delivery_option
        newShippingCost = deliveryOption === 'Entrega a Domicilio' ? (numDetails > 3 ? 80.00 : numDetails > 1 ? 60.00 : 50.00) : 0;

        newTotal = Number((totalSubtotal + newShippingCost + newTotalUrgentCost - newDiscount).toFixed(2));
        needsUpdate = true;

        // Distribuir descuento en order_details
        for (const detail of detailsForOrder) {
          if (newDiscount > 0) {
            detail.discount_applied = Number(((detail.subtotal / totalSubtotal) * newDiscount).toFixed(2));
          }
          orderDetailsToCreate.push(detail);
        }
      }

      // Generar OrderHistory si falta
      if (!fullOrder || !fullOrder.OrderHistories || fullOrder.OrderHistories.length === 0) {
        orderHistoriesToCreate.push({
          user_id: user.user_id,
          order_id: order.order_id,
          purchase_date: fullOrder ? fullOrder.created_at : new Date('2025-08-04T00:35:36.000Z'),
          order_status: fullOrder ? fullOrder.order_status : 'pending',
          total: newTotal,
        });
      }

      // Generar Payment si falta
      if (!fullOrder || !fullOrder.Payments || fullOrder.Payments.length === 0) {
        paymentsToCreate.push({
          order_id: order.order_id,
          payment_method: fullOrder ? fullOrder.payment_method : 'mercado_pago',
          amount: newTotal,
          status: fullOrder && fullOrder.payment_status === 'approved' ? 'approved' : 'validated',
          preference_id: null,
          mercado_pago_transaction_id: null,
          attempts: 0,
          created_at: new Date('2025-08-04T00:35:36.000Z'),
          updated_at: new Date('2025-08-04T00:35:36.000Z'),
        });
      }

      // Actualizar orden si se modificaron detalles o si la orden no existe
      if (needsUpdate || !fullOrder) {
        ordersToUpdate.push({
          order_id: order.order_id,
          user_id: user.user_id,
          address_id: address ? address.address_id : null,
          coupon_code: coupon ? coupon.code : (fullOrder ? fullOrder.coupon_code : null),
          total: newTotal,
          discount: newDiscount,
          shipping_cost: newShippingCost,
          payment_status: fullOrder ? fullOrder.payment_status : 'pending',
          payment_method: fullOrder ? fullOrder.payment_method : 'mercado_pago',
          order_status: fullOrder ? fullOrder.order_status : 'pending',
          estimated_delivery_date: fullOrder ? fullOrder.estimated_delivery_date : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          total_urgent_cost: newTotalUrgentCost,
          delivery_option: deliveryOption,
          created_at: fullOrder ? fullOrder.created_at : new Date('2025-08-04T00:35:36.000Z'),
          updated_at: new Date('2025-08-04T00:35:36.000Z'),
        });
      }
    }

    // Insertar registros faltantes
    if (orderDetailsToCreate.length > 0) {
      await OrderDetail.bulkCreate(orderDetailsToCreate, { transaction: t });
    }

    if (orderHistoriesToCreate.length > 0) {
      await OrderHistory.bulkCreate(orderHistoriesToCreate, { transaction: t });
    }

    if (paymentsToCreate.length > 0) {
      await Payment.bulkCreate(paymentsToCreate, { transaction: t });
    }

    if (ordersToUpdate.length > 0) {
      await Order.bulkCreate(ordersToUpdate, {
        transaction: t,
        updateOnDuplicate: ['total', 'discount', 'shipping_cost', 'total_urgent_cost', 'updated_at'],
      });
    }

    await t.commit();
    res.status(201).json({
      message: `Registros generados exitosamente: ${orderDetailsToCreate.length} order_details, ${orderHistoriesToCreate.length} order_history, ${paymentsToCreate.length} payments, ${ordersToUpdate.length} orders actualizadas`,
    });
  } catch (error) {
    await t.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al generar registros faltantes', error: error.message });
  }
};