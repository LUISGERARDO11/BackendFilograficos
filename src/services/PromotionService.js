const { Op } = require('sequelize');
const { Promotion, Coupon, CouponUsage, Order, PromotionProduct, PromotionCategory, ProductVariant, Product, Category, Cart } = require('../models/Associations');

class PromotionService {
  /**
   * Obtiene todas las promociones y cupones aplicables al carrito del usuario con detalles por ítem.
   * @param {Array} cartDetails - Detalles del carrito (variant_id, quantity, subtotal, category_id).
   * @param {number} userId - ID del usuario autenticado.
   * @param {string|null} couponCode - Código de cupón opcional.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Array} Promociones/cupones aplicables con ítems asociados.
   */
  async getApplicablePromotions(cartDetails, userId, couponCode = null, transaction = null) {
    const now = new Date();
    const whereClause = {
      status: 'active',
      start_date: { [Op.lte]: now },
      end_date: { [Op.gte]: now }
    };

    let promotions = [];
    let coupon = null;

    if (couponCode) {
      coupon = await Coupon.findOne({
        where: { code: couponCode, status: 'active' },
        include: [
          {
            model: Promotion,
            where: whereClause,
            include: [
              { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id'] },
              { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id'] }
            ]
          }
        ],
        transaction
      });
      if (coupon && coupon.Promotion) {
        promotions = [coupon.Promotion];
      }
    } else {
      promotions = await Promotion.findAll({
        where: whereClause,
        include: [
          { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id'] },
          { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id'] }
        ],
        transaction
      });
    }

    const applicablePromotions = [];
    const cartTotal = cartDetails.reduce((sum, detail) => sum + detail.subtotal, 0);

    for (const promotion of promotions) {
      const variantIds = Array.isArray(promotion.ProductVariants)
        ? promotion.ProductVariants.map(v => v.variant_id)
        : [];
      const categoryIds = Array.isArray(promotion.Categories)
        ? promotion.Categories.map(c => c.category_id)
        : [];
      let applicableItems = [];
      let isEligible = false;

      // Validar restricciones de la promoción
      if (promotion.min_order_value && cartTotal < promotion.min_order_value) {
        continue;
      }

      // Verificar usos máximos por usuario si aplica un cupón
      if (couponCode && promotion.max_uses_per_user) {
        const usageCount = await CouponUsage.count({
          where: { user_id: userId, promotion_id: promotion.promotion_id, coupon_id: coupon?.coupon_id },
          transaction
        });
        if (usageCount >= promotion.max_uses_per_user) {
          continue;
        }
      }

      // Verificar usos máximos totales si aplica un cupón
      if (couponCode && promotion.max_uses) {
        const totalUsage = await CouponUsage.count({
          where: { promotion_id: promotion.promotion_id, coupon_id: coupon?.coupon_id },
          transaction
        });
        if (totalUsage >= promotion.max_uses) {
          continue;
        }
      }

      // Verificar ítems aplicables
      applicableItems = cartDetails.filter(detail => {
        return (
          (promotion.applies_to === 'all') ||
          (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
          (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id))
        );
      });
      isEligible = applicableItems.length > 0 || promotion.applies_to === 'all';

      if (isEligible) {
        applicablePromotions.push({
          promotion_id: promotion.promotion_id,
          name: promotion.name,
          coupon_type: promotion.coupon_type,
          discount_value: promotion.discount_value,
          applies_to: promotion.applies_to,
          is_exclusive: promotion.is_exclusive,
          free_shipping_enabled: promotion.free_shipping_enabled,
          coupon_code: couponCode || null,
          applicable_items: applicableItems.map(item => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
            subtotal: item.subtotal
          }))
        });
      }
    }

    // Si hay promociones exclusivas, devolver solo la primera exclusiva
    const hasExclusive = applicablePromotions.some(p => p.is_exclusive);
    return hasExclusive ? applicablePromotions.filter(p => p.is_exclusive).slice(0, 1) : applicablePromotions;
  }

  /**
   * Verifica si una promoción es aplicable al carrito.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {number} userId - ID del usuario.
   * @param {string|null} couponCode - Código de cupón opcional.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {boolean} True si la promoción/cupón es aplicable.
   */
  async isPromotionApplicable(promotion, cartDetails, userId, couponCode = null, transaction = null) {
    const cartTotal = cartDetails.reduce((sum, detail) => sum + detail.subtotal, 0);
    if (promotion.min_order_value && cartTotal < promotion.min_order_value) {
      return false;
    }

    if (couponCode) {
      const coupon = await Coupon.findOne({
        where: { code: couponCode, status: 'active' },
        include: [{ model: Promotion, where: { promotion_id: promotion.promotion_id } }],
        transaction
      });
      if (!coupon) return false;

      if (promotion.max_uses_per_user) {
        const usageCount = await CouponUsage.count({
          where: { user_id: userId, promotion_id: promotion.promotion_id, coupon_id: coupon.coupon_id },
          transaction
        });
        if (usageCount >= promotion.max_uses_per_user) return false;
      }

      if (promotion.max_uses) {
        const totalUsage = await CouponUsage.count({
          where: { promotion_id: promotion.promotion_id, coupon_id: coupon.coupon_id },
          transaction
        });
        if (totalUsage >= promotion.max_uses) return false;
      }
    }

    const variantResults = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id'],
      transaction
    });
    console.log('PromotionProduct.findAll result:', variantResults); // Debugging
    const variantIds = Array.isArray(variantResults) ? variantResults.map(p => p.variant_id) : [];

    const categoryResults = await PromotionCategory.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['category_id'],
      transaction
    });
    console.log('PromotionCategory.findAll result:', categoryResults); // Debugging
    const categoryIds = Array.isArray(categoryResults) ? categoryResults.map(c => c.category_id) : [];

    return cartDetails.some(detail => (
      (promotion.applies_to === 'all') ||
      (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
      (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id))
    ));
  }

  /**
   * Aplica descuentos de promociones o cupones a los detalles del carrito.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {Array} promotions - Promociones/cupones a aplicar.
   * @param {number} userId - ID del usuario.
   * @param {number} cartId - ID del carrito.
   * @param {string|null} couponCode - Código de cupón opcional.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Detalles actualizados, descuento total y costo de envío.
   */
  async applyPromotions(cartDetails, promotions, userId, cartId, couponCode = null, transaction = null) {
    let totalDiscount = 0;
    let shippingCost = 0;
    let validCouponCode = null; // Track valid coupon code
    const updatedOrderDetails = cartDetails.map(detail => ({ ...detail, discount_applied: 0 }));

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.findOne({
        where: { code: couponCode, status: 'active' },
        include: [{ model: Promotion }],
        transaction
      });
      if (!coupon) {
        // Don't throw error, just skip coupon application
        console.warn(`Coupon code ${couponCode} is invalid or inactive`);
      } else {
        validCouponCode = couponCode; // Only set if coupon is valid
      }
    }

    for (const promotion of promotions) {
      const variantResults = await PromotionProduct.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['variant_id'],
        transaction
      });
      console.log('PromotionProduct.findAll result:', variantResults);
      const variantIds = Array.isArray(variantResults) ? variantResults.map(p => p.variant_id) : [];

      const categoryResults = await PromotionCategory.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['category_id'],
        transaction
      });
      console.log('PromotionCategory.findAll result:', categoryResults);
      const categoryIds = Array.isArray(categoryResults) ? categoryResults.map(c => c.category_id) : [];

      for (const detail of updatedOrderDetails) {
        const isEligible =
          (promotion.applies_to === 'all') ||
          (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
          (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id));

        if (!isEligible) continue;

        let discount = 0;
        if (promotion.coupon_type === 'percentage_discount') {
          discount = detail.subtotal * (promotion.discount_value / 100);
        } else if (promotion.coupon_type === 'fixed_discount') {
          discount = Math.min(promotion.discount_value, detail.subtotal);
        } else if (promotion.coupon_type === 'free_shipping' && promotion.free_shipping_enabled) {
          shippingCost = 0;
        }

        detail.discount_applied = (detail.discount_applied || 0) + discount;
        totalDiscount += discount;
      }

      if (validCouponCode && coupon) {
        await CouponUsage.create({
          promotion_id: promotion.promotion_id,
          coupon_id: coupon.coupon_id,
          user_id: userId,
          cart_id: cartId,
          applied_at: new Date()
        }, { transaction });
      }
    }

    for (const detail of updatedOrderDetails) {
      detail.discount_applied = Math.min(detail.discount_applied, detail.subtotal);
    }

    // Only update coupon_code if it's valid
    await Cart.update(
      { total_discount: totalDiscount, coupon_code: validCouponCode },
      { where: { cart_id: cartId }, transaction }
    );

    return { updatedOrderDetails, totalDiscount, shippingCost, validCouponCode };
  }

  /**
   * Verifica si una variante es elegible para una promoción.
   * @param {Object} promotion - Promoción.
   * @param {number} variantId - ID de la variante.
   * @param {number} categoryId - ID de la categoría.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {boolean} True si la variante es elegible.
   */
  async isVariantEligible(promotion, variantId, categoryId, transaction = null) {
    if (promotion.applies_to === 'all') return true;
    if (promotion.applies_to === 'specific_products') {
      const promoProduct = await PromotionProduct.findOne({
        where: { promotion_id: promotion.promotion_id, variant_id: variantId },
        transaction
      });
      return !!promoProduct;
    }
    if (promotion.applies_to === 'specific_categories') {
      const categoryResults = await PromotionCategory.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['category_id'],
        transaction
      });
      const categoryIds = Array.isArray(categoryResults) ? categoryResults.map(c => c.category_id) : [];
      return categoryIds.includes(categoryId);
    }
    return false;
  }

  /**
   * Genera un mensaje indicando el progreso hacia una promoción o cupón.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {number} userId - ID del usuario.
   * @param {string|null} couponCode - Código de cupón opcional.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Mensaje de progreso.
   */
  async getPromotionProgress(promotion, cartDetails, userId, couponCode = null, transaction = null) {
    let message = '';
    const isEligible = await this.isPromotionApplicable(promotion, cartDetails, userId, couponCode, transaction);
    const cartTotal = cartDetails.reduce((sum, detail) => sum + detail.subtotal, 0);

    if (!isEligible && promotion.min_order_value && cartTotal < promotion.min_order_value) {
      const remaining = promotion.min_order_value - cartTotal;
      message = `Te faltan $${remaining.toFixed(2)} en tu carrito para aplicar ${couponCode ? `el cupón ${couponCode}` : 'la promoción'}.`;
    } else if (promotion.coupon_type === 'percentage_discount') {
      message = isEligible
        ? `¡${couponCode ? `Cupón ${couponCode}` : 'Promoción'} válida! Aplica un ${promotion.discount_value}% de descuento.`
        : `El ${couponCode ? `cupón ${couponCode}` : 'promoción'} no es aplicable a los ítems en tu carrito.`;
    } else if (promotion.coupon_type === 'fixed_discount') {
      message = isEligible
        ? `¡${couponCode ? `Cupón ${couponCode}` : 'Promoción'} válida! Aplica un descuento fijo de $${promotion.discount_value}.`
        : `El ${couponCode ? `cupón ${couponCode}` : 'promoción'} no es aplicable a los ítems en tu carrito.`;
    } else if (promotion.coupon_type === 'free_shipping') {
      message = isEligible
        ? `¡${couponCode ? `Cupón ${couponCode}` : 'Promoción'} válida! Obtén envío gratis.`
        : `El ${couponCode ? `cupón ${couponCode}` : 'promoción'} no es aplicable a los ítems en tu carrito.`;
    }

    return { message, is_eligible: isEligible };
  }

  /**
   * Crea una nueva promoción y opcionalmente un cupón asociado.
   * @param {Object} promotionData - Datos de la promoción.
   * @param {string|null} couponCode - Código de cupón opcional.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Promoción y cupón creados.
   */
  async createPromotion(promotionData, couponCode = null, transaction = null) {
    const { 
      name, coupon_type, discount_value, max_uses, max_uses_per_user, min_order_value, free_shipping_enabled,
      applies_to, is_exclusive, start_date, end_date, created_by, status, variantIds, categoryIds 
    } = promotionData;

    const promotion = await Promotion.create({
      name,
      coupon_type,
      discount_value,
      max_uses,
      max_uses_per_user,
      min_order_value,
      free_shipping_enabled: coupon_type === 'free_shipping' ? free_shipping_enabled : false,
      applies_to,
      is_exclusive,
      start_date,
      end_date,
      created_by,
      status
    }, { transaction });

    if (variantIds && variantIds.length > 0 && applies_to === 'specific_products') {
      const promotionProducts = variantIds.map(variant_id => ({
        promotion_id: promotion.promotion_id,
        variant_id
      }));
      await PromotionProduct.bulkCreate(promotionProducts, { transaction });
    }

    if (categoryIds && categoryIds.length > 0 && applies_to === 'specific_categories') {
      const promotionCategories = categoryIds.map(category_id => ({
        promotion_id: promotion.promotion_id,
        category_id
      }));
      await PromotionCategory.bulkCreate(promotionCategories, { transaction });
    }

    let coupon = null;
    if (couponCode) {
      coupon = await Coupon.create({
        code: couponCode,
        promotion_id: promotion.promotion_id,
        status: 'active'
      }, { transaction });
    }

    return await Promotion.findByPk(promotion.promotion_id, {
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] },
        { model: Coupon, attributes: ['coupon_id', 'code', 'status'] }
      ],
      transaction
    });
  }

  /**
   * Obtiene promociones con paginación y filtros.
   * @param {Object} options - Opciones de consulta (where, order, page, pageSize).
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Promociones y conteo total.
   */
  async getPromotions({ where = {}, order = [['promotion_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
    const offset = (page - 1) * pageSize;
    
    const finalWhere = {
      ...where,
      status: 'active',
      start_date: { [Op.lte]: new Date() },
      end_date: { [Op.gte]: new Date() }
    };

    const { count, rows } = await Promotion.findAndCountAll({
      where: finalWhere,
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] },
        { model: Coupon, attributes: ['coupon_id', 'code', 'status'] }
      ],
      order,
      limit: pageSize,
      offset,
      transaction
    });

    return { count, rows };
  }

  /**
   * Obtiene una promoción por ID.
   * @param {number} id - ID de la promoción.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object|null} Promoción encontrada o null.
   */
  async getPromotionById(id, transaction = null) {
    const promotion = await Promotion.findByPk(id, {
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] },
        { model: Coupon, attributes: ['coupon_id', 'code', 'status'] }
      ],
      transaction
    });
    if (!promotion || promotion.status !== 'active') return null;
    return promotion;
  }

  /**
   * Actualiza una promoción existente y sus cupones asociados.
   * @param {number} id - ID de la promoción.
   * @param {Object} data - Datos a actualizar.
   * @param {Array} variantIds - IDs de variantes asociadas.
   * @param {Array} categoryIds - IDs de categorías asociadas.
   * @param {string|null} couponCode - Código de cupón opcional para crear/actualizar.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Promoción actualizada.
   */
  async updatePromotion(id, data, variantIds = [], categoryIds = [], couponCode = null, transaction = null) {
    const promotion = await Promotion.findByPk(id, { transaction });
    if (!promotion) throw new Error('Promoción no encontrada');
    if (promotion.status !== 'active') throw new Error('No se puede actualizar una promoción inactiva');

    const { coupon_type, max_uses, max_uses_per_user, min_order_value, free_shipping_enabled, applies_to } = data;
    data.free_shipping_enabled = coupon_type === 'free_shipping' ? free_shipping_enabled : false;

    await promotion.update(data, { transaction });

    await PromotionProduct.destroy({ where: { promotion_id: id }, transaction });
    if (variantIds.length > 0 && applies_to === 'specific_products') {
      await PromotionProduct.bulkCreate(variantIds.map(variantId => ({
        promotion_id: id,
        variant_id: variantId
      })), { transaction });
    }

    await PromotionCategory.destroy({ where: { promotion_id: id }, transaction });
    if (categoryIds.length > 0 && applies_to === 'specific_categories') {
      await PromotionCategory.bulkCreate(categoryIds.map(categoryId => ({
        promotion_id: id,
        category_id: categoryId
      })), { transaction });
    }

    if (couponCode) {
      const existingCoupon = await Coupon.findOne({ where: { promotion_id: id }, transaction });
      if (existingCoupon) {
        await existingCoupon.update({ code: couponCode, status: 'active' }, { transaction });
      } else {
        await Coupon.create({
          code: couponCode,
          promotion_id: id,
          status: 'active'
        }, { transaction });
      }
    }

    return await this.getPromotionById(id, transaction);
  }

  /**
   * Desactiva una promoción y sus cupones asociados (eliminación lógica).
   * @param {number} id - ID de la promoción.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Mensaje de confirmación.
   */
  async deletePromotion(id, transaction = null) {
    const promotion = await Promotion.findByPk(id, { transaction });
    if (!promotion) throw new Error('Promoción no encontrada');

    await promotion.update({ status: 'inactive' }, { transaction });
    await Coupon.update({ status: 'inactive' }, { where: { promotion_id: id }, transaction });

    return { message: 'Promoción y cupones asociados desactivados exitosamente' };
  }
}

module.exports = PromotionService;