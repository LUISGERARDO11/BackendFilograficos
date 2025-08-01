/* The `PromotionService` class contains methods for managing promotions, checking their applicability,
applying discounts, creating, updating, and deleting promotions in an e-commerce system. */
const { Op } = require('sequelize');
const { Promotion, Order, PromotionProduct, PromotionCategory, ProductVariant, Product, Category } = require('../models/Associations');

class PromotionService {
  /**
   * Obtiene todas las promociones aplicables al carrito del usuario con detalles por ítem.
   * @param {Array} cartDetails - Detalles del carrito (variant_id, quantity, unit_measure, subtotal, category_id).
   * @param {number} userId - ID del usuario autenticado.
   * @returns {Array} Promociones aplicables con ítems asociados.
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
        { model: ProductVariant, through: { model: PromotionProduct, attributes: [] }, attributes: ['variant_id'] },
        { model: Category, through: { model: PromotionCategory, attributes: [] }, attributes: ['category_id'] }
      ]
    });

    const applicablePromotions = [];

    for (const promotion of promotions) {
      const variantIds = promotion.ProductVariants.map(v => v.variant_id);
      const categoryIds = promotion.Categories.map(c => c.category_id);
      let applicableItems = [];
      let isEligible = false;

      if (promotion.promotion_type === 'order_count_discount') {
        // Para order_count_discount, verificar solo el conteo de pedidos
        const orderCount = await this.countOrders(userId);
        isEligible = orderCount >= (promotion.min_order_count || 0);
        // Incluir todos los ítems del carrito si es elegible, ya que aplica al total
        if (isEligible) {
          applicableItems = cartDetails;
        }
      } else {
        // Para otros tipos de promociones, verificar ítems del carrito
        applicableItems = cartDetails.filter(detail => {
          const isItemEligible =
            (promotion.applies_to === 'all') ||
            (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
            (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id));

          if (!isItemEligible) return false;

          if (promotion.promotion_type === 'quantity_discount') {
            return detail.quantity >= (promotion.min_quantity || 0);
          } else if (promotion.promotion_type === 'unit_discount') {
            return detail.unit_measure >= (promotion.min_unit_measure || 0);
          }
          return false;
        });
        isEligible = applicableItems.length > 0;
      }

      if (isEligible) {
        applicablePromotions.push({
          promotion_id: promotion.promotion_id,
          name: promotion.name,
          promotion_type: promotion.promotion_type,
          discount_value: promotion.discount_value,
          applies_to: promotion.applies_to,
          is_exclusive: promotion.is_exclusive,
          min_order_count: promotion.min_order_count,
          applicable_items: applicableItems.map(item => ({
            variant_id: item.variant_id,
            quantity: item.quantity,
            unit_measure: item.unit_measure
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
    const totalQuantity = await this.getTotalQuantityEligible(promotion, cartDetails);
    return totalQuantity >= (promotion.min_quantity || 0);
  }

  /**
   * Verifica si aplica un descuento por número de pedidos.
   * @param {Object} promotion - Promoción.
   * @param {number} userId - ID del usuario.
   * @returns {boolean} True si el número de pedidos es suficiente.
   */
  async checkOrderCountDiscount(promotion, userId) {
    const orderCount = await this.countOrders(userId);
    return orderCount >= (promotion.min_order_count || 0);
  }

  /**
   * Verifica si aplica un descuento por unidades (metros).
   * @param {Object} promotion - Promoción.
   * @param {Array} cartDetails - Detalles del carrito.
   * @returns {boolean} True si la medida total es suficiente.
   */
  async checkUnitDiscount(promotion, cartDetails) {
    const totalUnits = await this.getTotalUnitsEligible(promotion, cartDetails);
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
    const updatedOrderDetails = cartDetails.map(detail => ({ ...detail, discount_applied: 0 }));

    for (const promotion of promotions) {
      const variantIds = await PromotionProduct.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['variant_id']
      }).map(p => p.variant_id);
      const categoryIds = await PromotionCategory.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['category_id']
      }).map(c => c.category_id);

      for (const detail of updatedOrderDetails) {
        const isEligible =
          (promotion.applies_to === 'all') ||
          (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
          (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id));

        if (!isEligible) continue;

        let isApplicable = false;
        if (promotion.promotion_type === 'quantity_discount' && detail.quantity >= (promotion.min_quantity || 0)) {
          isApplicable = true;
        } else if (promotion.promotion_type === 'unit_discount' && detail.unit_measure >= (promotion.min_unit_measure || 0)) {
          isApplicable = true;
        } else if (promotion.promotion_type === 'order_count_discount' && promotion.min_order_count) {
          const orderCount = await this.countOrders(detail.user_id || userId);
          isApplicable = orderCount >= promotion.min_order_count;
        }

        if (isApplicable) {
          const discount = detail.subtotal * (promotion.discount_value / 100);
          detail.discount_applied = (detail.discount_applied || 0) + discount;
          totalDiscount += discount;
        }
      }
    }

    // Asegurar que el descuento no exceda el subtotal
    for (const detail of updatedOrderDetails) {
      detail.discount_applied = Math.min(detail.discount_applied, detail.subtotal);
    }

    return { updatedOrderDetails, totalDiscount };
  }

  /**
   * Verifica si una variante es elegible para una promoción.
   * @param {Object} promotion - Promoción.
   * @param {number} variantId - ID de la variante.
   * @param {number} categoryId - ID de la categoría.
   * @returns {boolean} True si la variante es elegible.
   */
  async isVariantEligible(promotion, variantId, categoryId) {
    if (promotion.applies_to === 'all') return true;
    if (promotion.applies_to === 'specific_products') {
      const promoProduct = await PromotionProduct.findOne({ 
        where: { promotion_id: promotion.promotion_id, variant_id: variantId } 
      });
      return !!promoProduct;
    }
    if (promotion.applies_to === 'specific_categories') {
      const categoryIds = await PromotionCategory.findAll({
        where: { promotion_id: promotion.promotion_id },
        attributes: ['category_id']
      }).map(c => c.category_id);
      return categoryIds.includes(categoryId);
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
    const isEligible = await this.isPromotionApplicable(promotion, cartDetails, userId);

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
        message = `Te faltan ${remaining} pedidos completados para obtener un ${promotion.discount_value}% de descuento (≥${promotion.min_order_count} pedidos).`;
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

    return { message, is_eligible: isEligible };
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

    return cartDetails.reduce((sum, detail) => {
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id)) ||
        promotion.applies_to === 'all'
      ) {
        return sum + detail.quantity;
      }
      return sum;
    }, 0);
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

    const categoryIds = await PromotionCategory.findAll({
      where: { promotion_id: promotion.promotion_id },
      attributes: ['category_id']
    }).map(c => c.category_id);

    return cartDetails.reduce((sum, detail) => {
      if (
        (promotion.applies_to === 'specific_products' && variantIds.includes(detail.variant_id)) ||
        (promotion.applies_to === 'specific_categories' && categoryIds.includes(detail.category_id)) ||
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
    
    // Asegurar que where tenga los filtros correctos
    const finalWhere = {
      ...where,
      status: 'active',
      start_date: { [Op.lte]: new Date() },
      end_date: { [Op.gte]: new Date() }
    };

    const { count, rows } = await Promotion.findAndCountAll({
      where: finalWhere, // Usar los mismos filtros para count y rows
      include: [
        // ... tus includes
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