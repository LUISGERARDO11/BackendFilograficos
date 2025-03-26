const { Op } = require('sequelize');
const { Promotion, Order, OrderDetail, PromotionProduct, PromotionCategory, ProductVariant, Product, Category } = require('../models/Associations');

class PromotionService {
  async getApplicablePromotions(orderDetails, userId) {
    const now = new Date();
    const promotions = await Promotion.findAll({
      where: {
        status: 'active',
        start_date: { [Op.lte]: now },
        end_date: { [Op.gte]: now }
      }
    });

    const applicablePromotions = [];
    for (const promotion of promotions) {
      if (await this.isPromotionApplicable(promotion, orderDetails, userId)) {
        applicablePromotions.push(promotion);
      }
    }

    const hasExclusive = applicablePromotions.some(p => p.is_exclusive);
    return hasExclusive ? applicablePromotions.filter(p => p.is_exclusive).slice(0, 1) : applicablePromotions;
  }

  async isPromotionApplicable(promotion, orderDetails, userId) {
    switch (promotion.promotion_type) {
      case 'quantity_discount':
        return await this.checkQuantityDiscount(promotion, orderDetails);
      case 'order_count_discount':
        return await this.checkOrderCountDiscount(promotion, userId);
      case 'unit_discount':
        return await this.checkUnitDiscount(promotion, orderDetails);
      default:
        return false;
    }
  }

  async checkQuantityDiscount(promotion, orderDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    const categoryIds = await PromotionCategory.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['category_id']
    }).map(c => c.category_id);

    const totalQuantity = await orderDetails.reduce(async (sumPromise, detail) => {
      const sum = await sumPromise;
      const variant = await ProductVariant.findByPk(detail.variant_id, {
        include: [{ model: Product, attributes: ['category_id'] }]
      });
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        (promotion.applies_to === 'specific_categories' && categoryIds.includes(variant.Product.category_id)) ||
        promotion.applies_to === 'all'
      ) {
        return sum + detail.quantity;
      }
      return sum;
    }, Promise.resolve(0));

    return totalQuantity >= (promotion.min_quantity || 0);
  }

  async checkOrderCountDiscount(promotion, userId) {
    const orderCount = await Order.count({
      where: {
        user_id: userId,
        order_status: 'delivered'
      }
    });
    return orderCount >= (promotion.min_order_count || 0);
  }

  async checkUnitDiscount(promotion, orderDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    const totalUnits = orderDetails.reduce((sum, detail) => {
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        promotion.applies_to === 'all'
      ) {
        return sum + (detail.unit_measure || 0);
      }
      return sum;
    }, 0);

    return totalUnits >= (promotion.min_unit_measure || 0);
  }

  async applyPromotions(orderDetails, promotions) {
    let totalDiscount = 0;
    for (const detail of orderDetails) {
      let detailDiscount = 0;
      for (const promotion of promotions) {
        if (await this.isVariantEligible(promotion, detail.variant_id)) {
          detailDiscount += detail.subtotal * (promotion.discount_value / 100);
        }
      }
      detail.discount_applied = Math.min(detailDiscount, detail.subtotal);
      totalDiscount += detail.discount_applied;
    }
    return { updatedOrderDetails: orderDetails, totalDiscount };
  }

  async isVariantEligible(promotion, variantId) {
    if (promotion.applies_to === 'all') return true;
    if (promotion.applies_to === 'specific_products') {
      const promoProduct = await PromotionProduct.findOne({ 
        where: { promotion_id: promotion.promotion_id, variant_id: variantId } 
      });
      return !!promoProduct;
    }
    if (promotion.applies_to === 'specific_categories') {
      const variant = await ProductVariant.findByPk(variantId, { 
        include: [{ model: Product, attributes: ['category_id'] }] 
      });
      const categoryIds = await PromotionCategory.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['category_id']
      }).map(c => c.category_id);
      return categoryIds.includes(variant.Product.category_id);
    }
    return false;
  }

  async createPromotion(promotionData) {
    const { 
      name, 
      promotion_type, 
      discount_value, 
      min_quantity, 
      min_order_count, 
      min_unit_measure, 
      applies_to, 
      is_exclusive, 
      start_date, 
      end_date, 
      created_by, 
      status, 
      variantIds, 
      categoryIds 
    } = promotionData;

    const promotion = await Promotion.create({
      name,
      promotion_type,
      discount_value,
      min_quantity: promotion_type === 'quantity_discount' ? min_quantity : null,
      min_order_count: promotion_type === 'order_count_discount' ? min_order_count : null,
      min_unit_measure: promotion_type === 'unit_discount' ? min_unit_measure : null,
      applies_to,
      is_exclusive,
      start_date,
      end_date,
      created_by,
      status
    });

    if (variantIds && variantIds.length > 0 && applies_to === 'specific_products') {
      const promotionProducts = variantIds.map(variant_id => ({
        promotion_id: promotion.promotion_id,
        variant_id
      }));
      await PromotionProduct.bulkCreate(promotionProducts);
    }

    if (categoryIds && categoryIds.length > 0 && applies_to === 'specific_categories') {
      const promotionCategories = categoryIds.map(category_id => ({
        promotion_id: promotion.promotion_id,
        category_id
      }));
      await PromotionCategory.bulkCreate(promotionCategories);
    }

    // Devolver la promoción con sus relaciones
    return await Promotion.findByPk(promotion.promotion_id, {
      include: [
        {
          model: ProductVariant,
          through: { model: PromotionProduct, attributes: [] },
          attributes: ['variant_id', 'sku']
        },
        {
          model: Category,
          through: { model: PromotionCategory, attributes: [] },
          attributes: ['category_id', 'name']
        }
      ]
    });
  }

  async getPromotions({ where = {}, order = [['promotion_id', 'ASC']], page = 1, pageSize = 10 } = {}) {
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Promotion.findAndCountAll({
      where: { ...where, status: 'active' }, // Asegurar que solo se devuelvan promociones activas
      include: [
        {
          model: ProductVariant,
          through: { model: PromotionProduct, attributes: [] },
          attributes: ['variant_id', 'sku']
        },
        {
          model: Category,
          through: { model: PromotionCategory, attributes: [] },
          attributes: ['category_id', 'name']
        }
      ],
      order,
      limit: pageSize,
      offset,
    });

    return { count, rows };
  }

  async getPromotionById(id) {
    const promotion = await Promotion.findByPk(id, {
      where: { status: 'active' }, // Solo promociones activas
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] }
      ]
    });
    if (!promotion) throw new Error('Promoción no encontrada o inactiva');
    return promotion;
  }

  async updatePromotion(id, data, variantIds = [], categoryIds = []) {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new Error('Promoción no encontrada');
    if (promotion.status !== 'active') throw new Error('No se puede actualizar una promoción inactiva');

    const { promotion_type, min_quantity, min_order_count, min_unit_measure, applies_to } = data;
    data.min_quantity = promotion_type === 'quantity_discount' ? min_quantity : null;
    data.min_order_count = promotion_type === 'order_count_discount' ? min_order_count : null;
    data.min_unit_measure = promotion_type === 'unit_discount' ? min_unit_measure : null;

    await promotion.update(data);

    await PromotionProduct.destroy({ where: { promotion_id: id } });
    if (variantIds.length > 0 && applies_to === 'specific_products') {
      await PromotionProduct.bulkCreate(variantIds.map(variantId => ({
        promotion_id: id,
        variant_id: variantId
      })));
    }

    await PromotionCategory.destroy({ where: { promotion_id: id } });
    if (categoryIds.length > 0 && applies_to === 'specific_categories') {
      await PromotionCategory.bulkCreate(categoryIds.map(categoryId => ({
        promotion_id: id,
        category_id: categoryId
      })));
    }

    return await this.getPromotionById(id);
  }

  async deletePromotion(id) {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new Error('Promoción no encontrada');

    await promotion.update({ status: 'inactive' });

    return { message: 'Promoción desactivada exitosamente' };
  }
}

module.exports = PromotionService;