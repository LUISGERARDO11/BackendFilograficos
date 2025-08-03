const { Cart, CartDetail, Product, ProductVariant, ProductImage, CustomizationOption, User, Promotion, Coupon, CouponUsage } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');
const { body, param, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');

const promotionService = new PromotionService();

// Validaciones para addToCart
const validateAddToCart = [
  body('product_id').notEmpty().isInt({ min: 1 }).withMessage('El product_id debe ser un número entero positivo'),
  body('variant_id').notEmpty().isInt({ min: 1 }).withMessage('El variant_id debe ser un número entero positivo'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero mayor que 0'),
  body('option_id').optional().isInt({ min: 1 }).withMessage('El option_id debe ser un número entero positivo'),
  body('is_urgent').optional().isBoolean().withMessage('El campo is_urgent debe ser un booleano')
];

// Validaciones para updateCartItem
const validateUpdateCartItem = [
  body('cart_detail_id').notEmpty().isInt({ min: 1 }).withMessage('El cart_detail_id debe ser un número entero positivo'),
  body('quantity').notEmpty().isInt({ min: 1 }).withMessage('La cantidad debe ser un número entero mayor que 0'),
  body('is_urgent').optional().isBoolean().withMessage('El campo is_urgent debe ser un booleano')
];

// Validaciones para removeCartItem
const validateRemoveCartItem = [
  param('cartDetailId').isInt({ min: 1 }).withMessage('El cartDetailId debe ser un número entero positivo')
];

exports.addToCart = [
  validateAddToCart,
  async (req, res) => {
    const transaction = await Cart.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { product_id, variant_id, quantity, option_id, is_urgent } = req.body;
      const user_id = req.user?.user_id;
      if (!user_id) {
        await transaction.rollback();
        return res.status(401).json({ message: 'Usuario no autenticado' });
      }

      const product = await Product.findByPk(product_id, {
        attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_cost', 'standard_delivery_days', 'urgent_delivery_days'],
        include: [{
          model: ProductVariant,
          where: { variant_id },
          attributes: ['variant_id', 'calculated_price', 'stock'],
        }],
        transaction
      });

      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Producto no encontrado' });
      }

      if (!product.ProductVariants || product.ProductVariants.length === 0) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Variante no encontrada o no pertenece al producto' });
      }

      const variant = product.ProductVariants[0];

      if (variant.stock < quantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Stock insuficiente' });
      }

      if (is_urgent && !product.urgent_delivery_enabled) {
        await transaction.rollback();
        return res.status(400).json({ message: 'El producto no permite entrega urgente' });
      }

      let customization = null;
      if (option_id) {
        customization = await CustomizationOption.findByPk(option_id, { transaction });
        if (!customization || customization.product_id !== product_id) {
          await transaction.rollback();
          return res.status(404).json({ message: 'Opción de personalización no encontrada o no pertenece al producto' });
        }
      }

      let cart = await Cart.findOne({
        where: { user_id, status: 'active' },
        transaction
      });

      if (!cart) {
        cart = await Cart.create(
          { user_id, status: 'active', total: 0, total_urgent_delivery_fee: 0, total_discount: 0 },
          { transaction }
        );
      }

      const unit_price = parseFloat(variant.calculated_price);
      const urgent_delivery_fee = is_urgent ? parseFloat(product.urgent_delivery_cost) : 0;

      const existingCartDetail = await CartDetail.findOne({
        where: {
          cart_id: cart.cart_id,
          product_id,
          variant_id,
          option_id: option_id || null,
          is_urgent
        },
        transaction
      });

      let cartDetail;
      if (existingCartDetail) {
        const newQuantity = existingCartDetail.quantity + quantity;
        if (variant.stock < newQuantity) {
          await transaction.rollback();
          return res.status(400).json({ message: 'Stock insuficiente para la cantidad total' });
        }
        await existingCartDetail.update(
          {
            quantity: newQuantity,
            unit_price,
            urgent_delivery_fee,
            subtotal: (newQuantity * unit_price) + urgent_delivery_fee
          },
          { transaction }
        );
        cartDetail = existingCartDetail;
      } else {
        cartDetail = await CartDetail.create(
          {
            cart_id: cart.cart_id,
            product_id,
            variant_id,
            option_id: option_id || null,
            quantity,
            unit_price,
            urgent_delivery_fee,
            subtotal: (quantity * unit_price) + urgent_delivery_fee,
            is_urgent
          },
          { transaction }
        );
      }

      // Recalcular promociones automáticas
      const cartDetails = await CartDetail.findAll({
        where: { cart_id: cart.cart_id },
        include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }],
        transaction
      });

      const formattedCartDetails = cartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: detail.unit_measure || 0,
        subtotal: parseFloat(detail.subtotal),
        category_id: detail.ProductVariant?.Product?.category_id || null
      }));

      const applicablePromotions = await promotionService.getApplicablePromotions(formattedCartDetails, user_id, null, transaction);
      let totalDiscount = 0;

      if (applicablePromotions.length > 0) {
        const { updatedOrderDetails, totalDiscount: calculatedDiscount } = await promotionService.applyPromotions(formattedCartDetails, applicablePromotions, user_id, cart.cart_id, null, transaction);
        totalDiscount = calculatedDiscount;

        for (const detail of cartDetails) {
          const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
          await detail.update({ discount_applied: updatedDetail.discount_applied }, { transaction });
        }
      }

      // Actualizar totales del carrito
      const total = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal), 0);
      const total_urgent_delivery_fee = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.urgent_delivery_fee || 0), 0);
      await cart.update(
        { total, total_urgent_delivery_fee, total_discount: totalDiscount },
        { transaction }
      );

      await transaction.commit();
      res.status(200).json({
        message: 'Producto añadido al carrito exitosamente',
        cart_id: cart.cart_id,
        total,
        total_discount: totalDiscount
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al añadir al carrito', error: error.message });
    }
  }
];

exports.getCart = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
    const user_id = req.user?.user_id;
    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const cart = await Cart.findOne({
      where: { user_id, status: 'active' },
      include: [
        {
          model: CartDetail,
          include: [
            {
              model: Product,
              attributes: ['product_id', 'name', 'category_id', 'standard_delivery_days', 'urgent_delivery_days', 'urgent_delivery_cost', 'urgent_delivery_enabled']
            },
            {
              model: ProductVariant,
              attributes: ['variant_id', 'sku', 'calculated_price', 'stock'],
              include: [
                { model: ProductImage, attributes: ['image_url', 'order'] }
              ]
            },
            { model: CustomizationOption, attributes: ['option_id', 'option_type', 'description'], required: false }
          ]
        }
      ],
      transaction
    });

    if (!cart) {
      // Fetch only automatic order count promotions (not tied to a Coupon)
      const orderCountPromotions = await Promotion.findAll({
        where: {
          status: 'active',
          coupon_type: 'order_count_discount',
          start_date: { [Op.lte]: new Date() },
          end_date: { [Op.gte]: new Date() }
        },
        include: [
          {
            model: Coupon,
            required: false,
            where: { status: 'active' },
            attributes: ['coupon_id', 'code']
          }
        ],
        transaction
      });

      const automaticOrderCountPromotions = orderCountPromotions.filter(promo => !promo.Coupon);

      const promotionProgress = await Promise.all(automaticOrderCountPromotions.map(async (promo) => {
        const { message, is_eligible } = await promotionService.getPromotionProgress(promo, [], user_id, null, transaction);
        return {
          promotion_id: promo.promotion_id,
          name: promo.name,
          coupon_type: promo.coupon_type,
          discount_value: parseFloat(promo.discount_value).toFixed(2),
          is_applicable: is_eligible,
          progress_message: message
        };
      }));

      await transaction.commit();
      return res.status(200).json({
        items: [],
        total: 0,
        total_discount: 0,
        total_urgent_delivery_fee: 0,
        estimated_delivery_days: 0,
        promotions: promotionProgress
      });
    }

    const items = cart.CartDetails.map(detail => ({
      cart_detail_id: detail.cart_detail_id,
      product_id: detail.product_id,
      product_name: detail.Product.name,
      variant_id: detail.variant_id,
      variant_sku: detail.ProductVariant.sku,
      calculated_price: parseFloat(detail.ProductVariant.calculated_price),
      quantity: detail.quantity,
      unit_price: parseFloat(detail.unit_price),
      urgent_delivery_fee: parseFloat(detail.urgent_delivery_fee || 0),
      discount_applied: parseFloat(detail.discount_applied || 0),
      subtotal: parseFloat(detail.subtotal),
      unit_measure: parseFloat(detail.unit_measure || 0).toFixed(2),
      category_id: detail.Product.category_id,
      is_urgent: detail.is_urgent,
      urgent_delivery_cost: parseFloat(detail.Product.urgent_delivery_cost || 0),
      urgent_delivery_enabled: detail.Product.urgent_delivery_enabled,
      standard_delivery_days: detail.Product.standard_delivery_days,
      urgent_delivery_days: detail.Product.urgent_delivery_days,
      customization: detail.CustomizationOption
        ? {
            option_id: detail.CustomizationOption.option_id,
            option_type: detail.CustomizationOption.option_type,
            description: detail.CustomizationOption.description
          }
        : null,
      images: detail.ProductVariant.ProductImages.map(img => ({
        image_url: img.image_url,
        order: img.order
      })),
      applicable_promotions: [] // Initialize empty, will be populated for automatic promotions
    }));

    const maxDeliveryDays = Math.max(...items.map(item =>
      item.is_urgent ? item.urgent_delivery_days || item.standard_delivery_days : item.standard_delivery_days
    ), 0);

    const cartDetails = items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_measure: parseFloat(item.unit_measure),
      subtotal: item.subtotal,
      category_id: item.category_id
    }));

    // Fetch only automatic promotions
    const applicablePromotions = await promotionService.getApplicablePromotions(cartDetails, user_id, null, transaction);

    const promotionProgress = [];
    for (const promo of applicablePromotions) {
      const { message, is_eligible } = await promotionService.getPromotionProgress(
        {
          promotion_id: promo.promotion_id,
          coupon_type: promo.coupon_type,
          discount_value: promo.discount_value,
          max_uses: promo.max_uses,
          max_uses_per_user: promo.max_uses_per_user,
          min_order_value: promo.min_order_value,
          free_shipping_enabled: promo.free_shipping_enabled,
          applies_to: promo.applies_to
        },
        cartDetails,
        user_id,
        null,
        transaction
      );

      if (is_eligible) {
        const applicableItems = items.filter(item =>
          promo.applicable_items.some(ap => ap.variant_id === item.variant_id) ||
          promo.coupon_type === 'order_count_discount'
        );

        applicableItems.forEach(item => {
          item.applicable_promotions.push({
            promotion_id: promo.promotion_id,
            name: promo.name,
            discount_value: parseFloat(promo.discount_value),
            coupon_type: promo.coupon_type
          });
        });
      }

      promotionProgress.push({
        promotion_id: promo.promotion_id,
        name: promo.name,
        coupon_type: promo.coupon_type,
        discount_value: parseFloat(promo.discount_value).toFixed(2),
        is_applicable: is_eligible,
        progress_message: message
      });
    }

    const total = parseFloat(cart.total);
    const total_discount = parseFloat(cart.total_discount || 0);
    const total_urgent_delivery_fee = parseFloat(cart.total_urgent_delivery_fee);

    await transaction.commit();
    res.status(200).json({
      items,
      total,
      total_discount,
      total_urgent_delivery_fee,
      estimated_delivery_days: maxDeliveryDays,
      promotions: promotionProgress
    });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el carrito', error: error.message });
    throw error;
  }
};

exports.updateCartItem = [
  validateUpdateCartItem,
  async (req, res) => {
    const transaction = await Cart.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { cart_detail_id, quantity, is_urgent } = req.body;
      const user_id = req.user?.user_id;

      if (!user_id) {
        await transaction.rollback();
        return res.status(401).json({ message: 'Usuario no autenticado' });
      }

      const cartDetail = await CartDetail.findByPk(cart_detail_id, {
        include: [
          {
            model: Cart,
            where: { user_id, status: 'active' }
          },
          {
            model: Product,
            attributes: ['product_id', 'urgent_delivery_enabled', 'urgent_delivery_cost', 'standard_delivery_days', 'urgent_delivery_days']
          },
          {
            model: ProductVariant
          }
        ],
        transaction
      });

      if (!cartDetail) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
      }

      if (is_urgent && !cartDetail.Product.urgent_delivery_enabled) {
        await transaction.rollback();
        return res.status(400).json({ message: 'El producto no permite entrega urgente' });
      }

      if (cartDetail.ProductVariant.stock < quantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Stock insuficiente' });
      }

      const unit_price = parseFloat(cartDetail.ProductVariant.calculated_price);
      const urgent_delivery_fee = is_urgent ? parseFloat(cartDetail.Product.urgent_delivery_cost) : 0;

      await cartDetail.update(
        {
          quantity,
          is_urgent: is_urgent !== undefined ? is_urgent : cartDetail.is_urgent,
          unit_price,
          urgent_delivery_fee,
          subtotal: (quantity * unit_price) + urgent_delivery_fee
        },
        { transaction }
      );

      // Recalcular promociones automáticas
      const cartDetails = await CartDetail.findAll({
        where: { cart_id: cartDetail.cart_id },
        include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }],
        transaction
      });

      const formattedCartDetails = cartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: detail.unit_measure || 0,
        subtotal: parseFloat(detail.subtotal),
        category_id: detail.ProductVariant?.Product?.category_id || null
      }));

      const applicablePromotions = await promotionService.getApplicablePromotions(formattedCartDetails, user_id, null, transaction);
      let totalDiscount = 0;

      if (applicablePromotions.length > 0) {
        const { updatedOrderDetails, totalDiscount: calculatedDiscount } = await promotionService.applyPromotions(formattedCartDetails, applicablePromotions, user_id, cartDetail.cart_id, null, transaction);
        totalDiscount = calculatedDiscount;

        for (const detail of cartDetails) {
          const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
          await detail.update({ discount_applied: updatedDetail.discount_applied }, { transaction });
        }
      } else {
        for (const detail of cartDetails) {
          await detail.update({ discount_applied: 0 }, { transaction });
        }
      }

      const total = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal), 0);
      const total_urgent_delivery_fee = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.urgent_delivery_fee || 0), 0);
      await cartDetail.Cart.update(
        { total, total_urgent_delivery_fee, total_discount: totalDiscount },
        { transaction }
      );

      await transaction.commit();
      res.status(200).json({
        message: 'Ítem actualizado exitosamente',
        cart_id: cartDetail.cart_id,
        total,
        total_discount: totalDiscount
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      return res.status(500).json({ message: 'Error al actualizar el ítem', error: error.message });
    }
  }
];

exports.removeCartItem = [
  validateRemoveCartItem,
  async (req, res) => {
    const transaction = await Cart.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const cart_detail_id = req.params.cartDetailId;
      const user_id = req.user?.user_id;

      if (!user_id) {
        await transaction.rollback();
        return res.status(401).json({ message: 'Usuario no autenticado' });
      }

      const cartDetail = await CartDetail.findByPk(cart_detail_id, {
        include: [{ model: Cart, where: { user_id, status: 'active' } }],
        transaction
      });

      if (!cartDetail) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
      }

      const cart_id = cartDetail.cart_id;
      await cartDetail.destroy({ transaction });

      // Recalcular promociones automáticas
      const cartDetails = await CartDetail.findAll({
        where: { cart_id },
        include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }],
        transaction
      });

      const formattedCartDetails = cartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: detail.unit_measure || 0,
        subtotal: parseFloat(detail.subtotal),
        category_id: detail.ProductVariant?.Product?.category_id || null
      }));

      const cart = await Cart.findByPk(cart_id, { transaction });
      const applicablePromotions = await promotionService.getApplicablePromotions(formattedCartDetails, user_id, null, transaction);
      let totalDiscount = 0;

      if (applicablePromotions.length > 0) {
        const { updatedOrderDetails, totalDiscount: calculatedDiscount } = await promotionService.applyPromotions(formattedCartDetails, applicablePromotions, user_id, cart_id, null, transaction);
        totalDiscount = calculatedDiscount;

        for (const detail of cartDetails) {
          const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
          await detail.update({ discount_applied: updatedDetail.discount_applied }, { transaction });
        }
      } else {
        for (const detail of cartDetails) {
          await detail.update({ discount_applied: 0 }, { transaction });
        }
      }

      const total = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal), 0);
      const total_urgent_delivery_fee = cartDetails.reduce((sum, detail) => sum + parseFloat(detail.urgent_delivery_fee || 0), 0);
      await Cart.update(
        { total, total_urgent_delivery_fee, total_discount: totalDiscount },
        { where: { cart_id }, transaction }
      );

      await transaction.commit();
      res.status(200).json({
        message: 'Ítem eliminado del carrito exitosamente',
        cart_id,
        total,
        total_discount: totalDiscount
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al eliminar el ítem', error: error.message });
    }
  }
];