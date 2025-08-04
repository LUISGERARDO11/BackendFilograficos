const { Cart, CartDetail, Product, ProductVariant, Coupon, Promotion, CouponUsage, ShippingOption, ClientCluster } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');

const promotionService = new PromotionService();

const validateApplyCoupon = [
  body('coupon_code').notEmpty().isString().trim().withMessage('El código de cupón es requerido'),
  body('cart').optional().isObject().withMessage('El carrito debe ser un objeto'),
  body('item').optional().custom((value) => {
    if (!value) return true;
    return (
      value.product_id && typeof value.product_id === 'number' &&
      value.variant_id && typeof value.variant_id === 'number' &&
      value.quantity && typeof value.quantity === 'number' && value.quantity > 0 &&
      (value.option_id === undefined || typeof value.option_id === 'number') &&
      (value.is_urgent === undefined || typeof value.is_urgent === 'boolean')
    );
  }).withMessage('Ítem de compra directa inválido'),
  body('estimated_delivery_days').optional().isInt({ min: 0 }).withMessage('Los días estimados de entrega deben ser un número entero no negativo')
];

exports.applyCoupon = [
  validateApplyCoupon,
  async (req, res) => {
    const transaction = await Cart.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const { coupon_code, cart, item, estimated_delivery_days, delivery_option } = req.body;
      const user_id = req.user?.user_id;
      if (!user_id) {
        await transaction.rollback();
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      let cartDetails = [];
      let cart_id = null;
      if (item) {
        const { product_id, variant_id, quantity, option_id, is_urgent } = item;
        const product = await Product.findByPk(product_id, {
          attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_cost', 'standard_delivery_days', 'urgent_delivery_days', 'category_id'],
          include: [{ model: ProductVariant, where: { variant_id }, attributes: ['variant_id', 'calculated_price', 'stock'] }],
          transaction
        });

        if (!product || !product.ProductVariants || product.ProductVariants.length === 0) {
          await transaction.rollback();
          return res.status(404).json({ success: false, message: 'Producto o variante no encontrada' });
        }

        const variant = product.ProductVariants[0];
        if (variant.stock < quantity) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: 'Stock insuficiente' });
        }

        const unit_price = parseFloat(variant.calculated_price);
        const urgent_delivery_fee = is_urgent && product.urgent_delivery_enabled ? parseFloat(product.urgent_delivery_cost) : 0;
        cartDetails = [{
          product_id,
          variant_id,
          quantity,
          unit_price,
          urgent_delivery_fee,
          subtotal: (quantity * unit_price) + (urgent_delivery_fee * quantity),
          is_urgent,
          option_id: option_id || null,
          ProductVariant: { Product: { category_id: product.category_id } }
        }];
      } else if (cart) {
        const activeCart = await Cart.findOne({
          where: { user_id, status: 'active' },
          include: [{ model: CartDetail, include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }] }],
          transaction
        });

        if (!activeCart || activeCart.CartDetails.length === 0) {
          await transaction.rollback();
          return res.status(400).json({ success: false, message: 'Carrito vacío o no encontrado' });
        }

        cart_id = activeCart.cart_id;
        cartDetails = activeCart.CartDetails.map(detail => ({
          product_id: detail.product_id,
          variant_id: detail.variant_id,
          quantity: detail.quantity,
          unit_price: parseFloat(detail.unit_price),
          urgent_delivery_fee: parseFloat(detail.urgent_delivery_fee || 0),
          subtotal: parseFloat(detail.subtotal),
          is_urgent: detail.is_urgent,
          option_id: detail.option_id,
          ProductVariant: { Product: { category_id: detail.ProductVariant.Product.category_id } }
        }));
      } else {
        await transaction.rollback();
        return res.status(400).json({ success: false, message: 'Se requiere un carrito o un ítem' });
      }

      const subtotal = cartDetails.reduce((sum, detail) => sum + detail.subtotal, 0);
      const total_urgent_delivery_fee = cartDetails.reduce((sum, detail) => sum + (detail.urgent_delivery_fee * detail.quantity), 0);

      // Usar estimated_delivery_days del frontend si se proporciona, si no, calcularlo
      let final_estimated_delivery_days;
      if (estimated_delivery_days !== undefined && Number.isInteger(estimated_delivery_days) && estimated_delivery_days >= 0) {
        final_estimated_delivery_days = estimated_delivery_days;
      } else {
        final_estimated_delivery_days = Math.max(...cartDetails.map(detail =>
          detail.is_urgent ?
            (detail.ProductVariant.Product.urgent_delivery_days || detail.ProductVariant.Product.standard_delivery_days || 0) :
            (detail.ProductVariant.Product.standard_delivery_days || 0)
        ), 0);
      }

      // Ajustar costo de envío según delivery_option
      const shippingOptions = await getShippingOptions();
      const selectedShippingOption = shippingOptions.find(option => option.name === delivery_option) || shippingOptions.find(option => option.name === 'Recoger en Tienda') || shippingOptions[0];
      let shipping_cost = parseFloat(selectedShippingOption.cost);

      const formattedCartDetails = cartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: 0,
        subtotal: detail.subtotal,
        category_id: detail.ProductVariant.Product.category_id
      }));

      const automaticPromotions = await promotionService.getApplicablePromotions(formattedCartDetails, user_id, null, transaction);
      let totalDiscount = 0;
      let appliedPromotions = [];

      if (automaticPromotions.length > 0) {
        const { updatedOrderDetails, totalDiscount: calculatedDiscount } = await promotionService.applyPromotions(formattedCartDetails, automaticPromotions, user_id, cart_id, null, transaction);
        totalDiscount = calculatedDiscount;
        appliedPromotions = automaticPromotions.map(promo => ({
          promotion_id: promo.promotion_id,
          name: promo.name,
          coupon_type: promo.coupon_type,
          discount_value: parseFloat(promo.discount_value),
          is_applicable: true,
          progress_message: `¡Promoción válida! Aplica un ${promo.coupon_type === 'percentage_discount' ? `${promo.discount_value}% de descuento` : `descuento fijo de $${promo.discount_value}`}.`
        }));

        for (const detail of cartDetails) {
          const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
          detail.discount_applied = updatedDetail.discount_applied || 0;
        }
      }

      let couponDiscount = 0;
      let appliedCoupon = null;
      if (coupon_code) {
        const coupon = await Coupon.findOne({
          where: { code: coupon_code, status: 'active' },
          include: [{ model: Promotion, where: { status: 'active', start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } } }],
          transaction
        });

        if (!coupon) {
          await transaction.rollback();
          return res.status(200).json({ success: false, message: `El cupón ${coupon_code} es inválido o inactivo` });
        }

        const promotion = coupon.Promotion;
        if (promotion.restrict_to_cluster && (promotion.cluster_id || promotion.cluster_id === 0)) {
          const userInCluster = await ClientCluster.findOne({
            where: { user_id, cluster: promotion.cluster_id },
            transaction
          });
          if (!userInCluster) {
            await transaction.rollback();
            return res.status(200).json({ success: false, message: `El usuario no pertenece al clúster de la promoción` });
          }
        }
        const isCouponApplicable = await promotionService.isPromotionApplicable(promotion, formattedCartDetails, user_id, coupon_code, transaction);
        if (!isCouponApplicable) {
          await transaction.rollback();
          return res.status(200).json({ success: false, message: `El cupón ${coupon_code} no es aplicable a los ítems del pedido` });
        }

        if (automaticPromotions.some(p => p.is_exclusive)) {
          await transaction.rollback();
          return res.status(200).json({ success: false, message: 'No se puede aplicar el cupón debido a una promoción automática exclusiva' });
        }

        if (promotion.coupon_type === 'percentage_discount') {
          couponDiscount = subtotal * (parseFloat(promotion.discount_value) / 100);
        } else if (promotion.coupon_type === 'fixed_discount') {
          couponDiscount = Math.min(parseFloat(promotion.discount_value), subtotal);
        } else if (promotion.coupon_type === 'free_shipping') {
          shipping_cost = 0;
        }

        totalDiscount += couponDiscount;
        appliedCoupon = {
          coupon_id: coupon.coupon_id,
          code: coupon.code,
          promotion_id: promotion.promotion_id,
          name: promotion.name,
          coupon_type: promotion.coupon_type,
          discount_value: parseFloat(promotion.discount_value),
          is_applicable: true,
          progress_message: `¡Cupón ${coupon_code} válido! Aplica un ${promotion.coupon_type === 'percentage_discount' ? `${promotion.discount_value}% de descuento` : promotion.coupon_type === 'fixed_discount' ? `descuento fijo de $${promotion.discount_value}` : 'envío gratis'}.`
        };

        await CouponUsage.create({
          promotion_id: promotion.promotion_id,
          coupon_id: coupon.coupon_id,
          user_id,
          cart_id,
          order_id: null,
          created_at: new Date(),
          updated_at: new Date()
        }, { transaction });
      }

      const total = Math.max(0, subtotal + shipping_cost + total_urgent_delivery_fee - totalDiscount);

      await transaction.commit();
      res.status(200).json({
        success: true,
        message: coupon_code && appliedCoupon ? `Cupón ${coupon_code} aplicado con éxito` : 'Cupón no aplicado',
        data: {
          subtotal,
          total,
          total_discount: totalDiscount,
          shipping_cost,
          total_urgent_delivery_fee,
          estimated_delivery_days: final_estimated_delivery_days,
          applied_promotions: [...appliedPromotions, ...(appliedCoupon ? [appliedCoupon] : [])],
          coupon_code: coupon_code || null
        }
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al aplicar el cupón', error: error.message });
    }
  }
];

async function getShippingOptions() {
  const shippingOptions = await ShippingOption.findAll({
    where: { status: 'active' },
    attributes: ['shipping_option_id', 'name', 'base_cost']
  });
  return shippingOptions.map(option => ({
    name: option.name,
    cost: parseFloat(option.base_cost)
  }));
}

module.exports = exports;