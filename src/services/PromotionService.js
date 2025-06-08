/* The `PromotionService` class contains methods for managing promotions, checking their applicability,
applying discounts, creating, updating, and deleting promotions in an e-commerce system. */
const { Op } = require('sequelize');
const { Promotion, Order, PromotionProduct, PromotionCategory, ProductVariant, Product, Category } = require('../models/Associations');

class PromotionService {
  /**
   * Obtiene todas las promociones aplicables al carrito del usuario.
   * @param {Array} cartDetails - Detalles del carrito (variant_id, quantity, unit_measure, subtotal).
   * @param {number} userId - ID del usuario autenticado.
   * @returns {Array} Promociones aplicables.
   */
  async getApplicablePromotions(cartDetails, userId) {
    const now = new Date();
    const promotions = await Promotion.findAll({
      where: {
        status: 'active',
        start_date: { [Op.lte]: now },
        end_date: { [Op.gte]: now }
      },
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] }
      ]
    });

    const applicablePromotions = [];
    for (const promotion of promotions) {
      if (await this.isPromotionApplicable(promotion, cartDetails, userId)) {
        applicablePromotions.push(promotion);
      }
    }

    // Si hay promociones exclusivas, solo devolver la primera exclusiva
    const hasExclusive = applicablePromotions.some(p => p.is_exclusive);
    return hasExclusive ? applicablePromotions.filter(p => p.is_exclusive).slice(0, 1) : applicablePromotions;
  }

  /**
   * Verifica si una promoción es aplicable al carrito.
   * @param {Object} promotion - Objeto de la promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {number} userId - ID del usuario.
   * @returns {boolean} True si la promoción es aplicable.
   */
  async isPromotionApplicable(promotion, cartDetails, userId) {
    switch (promotion.promotion_type) {
      case 'quantity_discount':
        return await this.checkQuantityDiscount(promotion, cartDetails);
      case 'order_count_discount':
        return await this.checkOrderCountDiscount(promotion, userId);
      case 'unit_discount':
        return await this.checkUnitDiscount(promotion, cartDetails);
      default:
        return false;
    }
  }

  /**
   * Verifica si aplica un descuento por cantidad.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @returns {boolean} True si la cantidad total es suficiente.
   */
  async checkQuantityDiscount(promotion, cartDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    const categoryIds = await PromotionCategory.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['category_id']
    }).map(c => c.category_id);

    const totalQuantity = await cartDetails.reduce(async (sumPromise, detail) => {
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

  /**
   * Verifica si aplica un descuento por número de pedidos.
   * @param {Object} promotion - Promoción.
   * @param {number} userId - ID del usuario.
   * @returns {boolean} True si el número de pedidos es suficiente.
   */
  async checkOrderCountDiscount(promotion, userId) {
    const orderCount = await Order.count({
      where: { user_id: userId, order_status: 'delivered' }
    });
    return orderCount >= (promotion.min_order_count || 0);
  }

  /**
   * Verifica si aplica un descuento por unidades (metros).
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @returns {boolean} True si la medida total es suficiente.
   */
  async checkUnitDiscount(promotion, cartDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    const totalUnits = cartDetails.reduce((sum, detail) => {
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

  /**
   * Aplica descuentos de promociones a los detalles del carrito.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {Array} promotions - Promociones a aplicar.
   * @returns {Object} Detalles actualizados y descuento total.
   */
  async applyPromotions(cartDetails, promotions) {
    let totalDiscount = 0;
    for (const detail of cartDetails) {
      let detailDiscount = 0;
      for (const promotion of promotions) {
        if (await this.isVariantEligible(promotion, detail.variant_id)) {
          detailDiscount += detail.subtotal * (promotion.discount_value / 100);
        }
      }
      detail.discount_applied = Math.min(detailDiscount, detail.subtotal);
      totalDiscount += detail.discount_applied;
    }
    return { updatedOrderDetails: cartDetails, totalDiscount };
  }

  /**
   * Verifica si una variante es elegible para una promoción.
   * @param {Object} promotion - Promoción.
   * @param {number} variantId - ID de la variante.
   * @returns {boolean} True si la variante es elegible.
   */
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

  /**
   * Genera un mensaje indicando el progreso hacia una promoción.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @param {number} userId - ID del usuario.
   * @returns {Object} Mensaje de progreso.
   */
  async getPromotionProgress(promotion, cartDetails, userId) {
    let message = '';
    if (promotion.promotion_type === 'quantity_discount') {
      const totalQuantity = await this.getTotalQuantityEligible(promotion, cartDetails);
      const remaining = (promotion.min_quantity || 0) - totalQuantity;
      if (remaining > 0) {
        message = `Te faltan ${remaining} productos para obtener un ${promotion.discount_value}% de descuento (Compra ≥${promotion.min_quantity} piezas).`;
      } else {
        message = `¡Promoción válida! Aplica un ${promotion.discount_value}% por comprar ${totalQuantity} piezas (≥${promotion.min_quantity}).`;
      }
    } else if (promotion.promotion_type === 'order_count_discount') {
      const orderCount = await this.countOrders(userId);
      const remaining = (promotion.min_order_count || 0) - orderCount;
      if (remaining > 0) {
        message = `Te faltan ${remaining} pedidos para obtener un ${promotion.discount_value}% de descuento (${orderCount + 1}º pedido).`;
      } else {
        message = `¡Promoción válida! Este es tu ${orderCount}º pedido, aplica un ${promotion.discount_value}% de descuento.`;
      }
    } else if (promotion.promotion_type === 'unit_discount') {
      const totalUnits = await this.getTotalUnitsEligible(promotion, cartDetails);
      const remaining = (promotion.min_unit_measure || 0) - totalUnits;
      if (remaining > 0) {
        message = `Te faltan ${remaining.toFixed(2)} metros para obtener un ${promotion.discount_value}% de descuento (≥${promotion.min_unit_measure} metros).`;
      } else {
        message = `¡Promoción válida! Aplica un ${promotion.discount_value}% por comprar ${totalUnits.toFixed(2)} metros (≥${promotion.min_unit_measure}).`;
      }
    }
    return { message };
  }

  /**
   * Calcula la cantidad total de ítems elegibles para una promoción.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @returns {number} Cantidad total.
   */
  async getTotalQuantityEligible(promotion, cartDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    const categoryIds = await PromotionCategory.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['category_id']
    }).map(c => c.category_id);

    const totalQuantity = await cartDetails.reduce(async (sumPromise, detail) => {
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

    return totalQuantity;
  }

  /**
   * Calcula el número de pedidos completados por el usuario.
   * @param {number} userId - ID del usuario.
   * @returns {number} Número de pedidos.
   */
  async countOrders(userId) {
    return await Order.count({
      where: { user_id: userId, order_status: 'delivered' }
    });
  }

  /**
   * Calcula la medida total (metros) elegible para una promoción.
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @returns {number} Medida total.
   */
  async getTotalUnitsEligible(promotion, cartDetails) {
    const variantIds = await PromotionProduct.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['variant_id']
    }).map(p => p.variant_id);

    return cartDetails.reduce((sum, detail) => {
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        promotion.applies_to === 'all'
      ) {
        return sum + (detail.unit_measure || 0);
      }
      return sum;
    }, 0);
  }

  /**
   * Crea una nueva promoción.
   * @param {Object} promotionData - Datos de la promoción.
   * @returns {Object} Promoción creada.
   */
  async createPromotion(promotionData) {
    const { 
      name, promotion_type, discount_value, min_quantity, min_order_count, min_unit_measure,
      applies_to, is_exclusive, start_date, end_date, created_by, status, variantIds, categoryIds 
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

    return await Promotion.findByPk(promotion.promotion_id, {
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] }
      ]
    });
  }

  /**
   * Obtiene promociones con paginación y filtros.
   * @param {Object} options - Opciones de consulta (where, order, page, pageSize).
   * @returns {Object} Promociones y conteo total.
   */
  async getPromotions({ where = {}, order = [['promotion_id', 'ASC']], page = 1, pageSize = 10 } = {}) {
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Promotion.findAndCountAll({
      where,
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] }
      ],
      order,
      limit: pageSize,
      offset
    });

    return { count, rows };
  }

  /**
   * Obtiene una promoción por ID.
   * @param {number} id - ID de la promoción.
   * @returns {Object|null} Promoción encontrada o null.
   */
  async getPromotionById(id) {
    const promotion = await Promotion.findByPk(id, {
      include: [
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id', 'sku'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id', 'name'] }
      ]
    });
    if (!promotion || promotion.status !== 'active') return null;
    return promotion;
  }

  /**
   * Actualiza una promoción existente.
   * @param {number} id - ID de la promoción.
   * @param {Object} data - Datos a actualizar.
   * @param {Array} variantIds - IDs de variantes asociadas.
   * @param {Array} categoryIds - IDs de categorías asociadas.
   * @returns {Object} Promoción actualizada.
   */
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

  /**
   * Desactiva una promoción (eliminación lógica).
   * @param {number} id - ID de la promoción.
   * @returns {Object} Mensaje de confirmación.
   */
  async deletePromotion(id) {
    const promotion = await Promotion.findByPk(id);
    if (!promotion) throw new Error('Promoción no encontrada');

    await promotion.update({ status: 'inactive' });

    return { message: 'Promoción desactivada exitosamente' };
  }
}

module.exports = PromotionService;