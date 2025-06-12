/* The OrderService class handles the creation of orders from a user's cart, including payment instruction 
   generation and cart cleanup, using direct model operations for consistency. */
require('dotenv').config();
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

class OrderService {
  /**
   * Creates an order from the user's cart, generates related records, and clears the cart.
   * @param {number} userId - The ID of the authenticated user.
   * @param {Object} orderData - The order data including address_id, is_urgent, payment_method, and coupon_code.
   * @returns {Object} - The created order, payment, and payment instructions.
   * @throws {Error} - If the cart is empty, address is invalid, or any operation fails.
   */
  async createOrder(userId, { address_id, is_urgent, payment_method, coupon_code }) {
    const { Cart, CartDetail, Order, OrderDetail, OrderHistory, Payment, Address, CouponUsage, Promotion, ProductVariant, Customization } = require('../models/Associations');

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
                model: Promotion,
                through: { attributes: [] },
                where: {
                  status: 'active',
                  start_date: { [Op.lte]: new Date() },
                  end_date: { [Op.gte]: new Date() }
                }
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

      // Calcular costo de envío (simulado)
      const shippingCost = is_urgent ? 50.00 : 20.00;
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
        order_status: 'pending',
        is_urgent
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
        throw new Error(`Error al crear registro de pago: ${error.message}`);
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