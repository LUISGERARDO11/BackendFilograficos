const { Cart, CartDetail, Product, ProductVariant, ProductImage, CustomizationOption, User, Promotion, Order } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');
const PromotionService = require('../services/PromotionService');

const promotionService = new PromotionService();

exports.addToCart = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
    const { product_id, variant_id, quantity, option_id } = req.body;
    const user_id = req.user?.user_id;
    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!product_id || !variant_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos: product_id, variant_id y quantity son obligatorios' });
    }
    if (quantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const variant = await ProductVariant.findByPk(variant_id, { transaction });
    if (!variant || variant.product_id !== product_id) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Variante no encontrada o no pertenece al producto' });
    }

    if (variant.stock < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Stock insuficiente' });
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
        { user_id, status: 'active' },
        { transaction }
      );
    }

    const existingCartDetail = await CartDetail.findOne({
      where: {
        cart_id: cart.cart_id,
        product_id,
        variant_id,
        option_id: option_id || null
      },
      transaction
    });

    if (existingCartDetail) {
      const newQuantity = existingCartDetail.quantity + quantity;
      if (variant.stock < newQuantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Stock insuficiente para la cantidad total' });
      }
      await existingCartDetail.update(
        {
          quantity: newQuantity,
          unit_price: variant.calculated_price,
          subtotal: newQuantity * variant.calculated_price
        },
        { transaction }
      );
    } else {
      await CartDetail.create(
        {
          cart_id: cart.cart_id,
          product_id,
          variant_id,
          option_id: option_id || null,
          quantity,
          unit_price: variant.calculated_price,
          subtotal: quantity * variant.calculated_price
        },
        { transaction }
      );
    }

    await transaction.commit();
    res.status(200).json({ message: 'Producto añadido al carrito exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al añadir al carrito', error: error.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    const cart = await Cart.findOne({
      where: { user_id, status: 'active' },
      include: [
        {
          model: CartDetail,
          include: [
            { model: Product, attributes: ['product_id', 'name', 'category_id'] },
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
      ]
    });

    if (!cart) {
      // Obtener promoción de order_count_discount para carrito vacío
      const orderCountPromotions = await Promotion.findAll({
        where: {
          status: 'active',
          promotion_type: 'order_count_discount',
          start_date: { [Op.lte]: new Date() },
          end_date: { [Op.gte]: new Date() }
        }
      });

      const promotionProgress = await Promise.all(orderCountPromotions.map(async (promo) => {
        const { message, is_eligible } = await promotionService.getPromotionProgress(promo, [], user_id);
        return {
          promotion_id: promo.promotion_id,
          name: promo.name,
          promotion_type: promo.promotion_type,
          discount_value: parseFloat(promo.discount_value).toFixed(2),
          is_applicable: is_eligible,
          progress_message: message
        };
      }));

      return res.status(200).json({ items: [], total: 0, promotions: promotionProgress });
    }

    // Formatear los ítems del carrito
    const items = cart.CartDetails.map(detail => ({
      cart_detail_id: detail.cart_detail_id,
      product_id: detail.product_id,
      product_name: detail.Product.name,
      variant_id: detail.variant_id,
      variant_sku: detail.ProductVariant.sku,
      calculated_price: parseFloat(detail.ProductVariant.calculated_price),
      quantity: detail.quantity,
      unit_price: parseFloat(detail.unit_price),
      subtotal: parseFloat(detail.subtotal),
      unit_measure: parseFloat(detail.unit_measure || 0).toFixed(2),
      category_id: detail.Product.category_id,
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
      applicable_promotions: []
    }));

    // Preparar detalles del carrito para PromotionService
    const cartDetails = items.map(item => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
      unit_measure: parseFloat(item.unit_measure),
      subtotal: item.subtotal,
      category_id: item.category_id
    }));

    // Obtener promociones aplicables
    const applicablePromotions = await promotionService.getApplicablePromotions(cartDetails, user_id);

    // Obtener promociones de tipo order_count_discount
    const orderCountPromotions = await Promotion.findAll({
      where: {
        status: 'active',
        promotion_type: 'order_count_discount',
        start_date: { [Op.lte]: new Date() },
        end_date: { [Op.gte]: new Date() }
      }
    });

    // Combinar promociones aplicables con order_count_discount, evitando duplicados
    const allPromotions = [
      ...applicablePromotions,
      ...orderCountPromotions.filter(op => !applicablePromotions.some(ap => ap.promotion_id === op.promotion_id)).map(op => ({
        promotion_id: op.promotion_id,
        name: op.name,
        promotion_type: op.promotion_type,
        discount_value: op.discount_value,
        applies_to: op.applies_to,
        is_exclusive: op.is_exclusive,
        min_order_count: op.min_order_count,
        applicable_items: []
      }))
    ];

    // Mapear promociones a ítems y generar mensajes de progreso
    const promotionProgress = [];
    for (const promo of allPromotions) {
      // Obtener mensaje de progreso y verificar si es aplicable
      const { message, is_eligible } = await promotionService.getPromotionProgress(
        {
          promotion_id: promo.promotion_id,
          promotion_type: promo.promotion_type,
          discount_value: promo.discount_value,
          min_quantity: promo.promotion_type === 'quantity_discount' ? promo.min_quantity : null,
          min_order_count: promo.promotion_type === 'order_count_discount' ? promo.min_order_count : null,
          min_unit_measure: promo.promotion_type === 'unit_discount' ? promo.min_unit_measure : null,
          applies_to: promo.applies_to
        },
        cartDetails,
        user_id
      );

      // Asignar promoción a ítems solo si es aplicable
      if (is_eligible) {
        const applicableItems = items.filter(item => 
          promo.applicable_items.some(ap => ap.variant_id === item.variant_id) ||
          promo.promotion_type === 'order_count_discount'
        );

        applicableItems.forEach(item => {
          item.applicable_promotions.push({
            promotion_id: promo.promotion_id,
            name: promo.name,
            discount_value: parseFloat(promo.discount_value),
            promotion_type: promo.promotion_type
          });
        });
      }

      promotionProgress.push({
        promotion_id: promo.promotion_id,
        name: promo.name,
        promotion_type: promo.promotion_type,
        discount_value: parseFloat(promo.discount_value).toFixed(2),
        is_applicable: is_eligible,
        progress_message: message
      });
    }

    // Calcular total monetario
    const total = items.reduce((sum, item) => sum + item.subtotal, 0);

    res.status(200).json({
      items,
      total,
      promotions: promotionProgress
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el carrito', error: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
    const { cart_detail_id, quantity } = req.body;
    const user_id = req.user?.user_id;

    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!cart_detail_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos: cart_detail_id y quantity son obligatorios' });
    }

    if (quantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    const cartDetail = await CartDetail.findByPk(cart_detail_id, {
      include: [
        { model: Cart, where: { user_id, status: 'active' } },
        { model: ProductVariant }
      ],
      transaction
    });

    if (!cartDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
    }

    if (cartDetail.ProductVariant.stock < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    await cartDetail.update(
      {
        quantity,
        subtotal: quantity * cartDetail.unit_price
      },
      { transaction }
    );

    await transaction.commit();
    res.status(200).json({ message: 'Cantidad actualizada exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar la cantidad', error: error.message });
  }
};

exports.removeCartItem = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
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

    await cartDetail.destroy({ transaction });

    await transaction.commit();
    res.status(200).json({ message: 'Ítem eliminado del carrito exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar el ítem', error: error.message });
  }
};