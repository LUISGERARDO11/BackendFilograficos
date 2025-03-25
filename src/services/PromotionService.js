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
      const variant = await ProductVariant.findByPk(detail.variant_id);
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        (promotion.applies_to === 'specific_categories' && categoryIds.includes(variant.category_id))
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
      if (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) {
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

  async createPromotion(data, variantIds = [], categoryIds = []) {
    const promotion = await Promotion.create(data);
    if (variantIds.length > 0) {
      await PromotionProduct.bulkCreate(variantIds.map(variantId => ({
        promotion_id: promotion.promotion_id,
        variant_id: variantId
      })));
    }
    if (categoryIds.length > 0) {
      await PromotionCategory.bulkCreate(categoryIds.map(categoryId => ({
        promotion_id: promotion.promotion_id,
        category_id: categoryId
      })));
    }
    return promotion;
  }

  async getPromotions() {
    return await Promotion.findAll({
      include: [
        { model: ProductVariant, through: PromotionProduct, as: 'Variants' },
        { model: Category, through: PromotionCategory, as: 'Categories' }
      ]
    });
  }

  async getPromotionById(id) {
    return await Promotion.findByPk(id, {
      include: [
        { model: ProductVariant, through: PromotionProduct, as: 'Variants' },
        { model: Category, through: PromotionCategory, as: 'Categories' }
      ]
    });
  }

  async updatePromotion(id, data, variantIds = [], categoryIds = []) {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new Error('Promoción no encontrada');
    await promotion.update(data);

    await PromotionProduct.destroy({ where: { promotion_id: id } });
    if (variantIds.length > 0) {
      await PromotionProduct.bulkCreate(variantIds.map(variantId => ({
        promotion_id: id,
        variant_id: variantId
      })));
    }

    await PromotionCategory.destroy({ where: { promotion_id: id } });
    if (categoryIds.length > 0) {
      await PromotionCategory.bulkCreate(categoryIds.map(categoryId => ({
        promotion_id: id,
        category_id: categoryId
      })));
    }

    return promotion;
  }

  async deletePromotion(id) {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new Error('Promoción no encontrada');
    await PromotionProduct.destroy({ where: { promotion_id: id } });
    await PromotionCategory.destroy({ where: { promotion_id: id } });
    await promotion.destroy();
    return { message: 'Promoción eliminada' };
  }
}

// Exportar la clase sin instanciarla
module.exports = PromotionService;