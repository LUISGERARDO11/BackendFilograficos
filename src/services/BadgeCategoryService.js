const { Op } = require('sequelize');
const { BadgeCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

class BadgeCategoryService {
  /**
   * Obtiene todas las categorías de insignias con paginación y filtros.
   * @param {Object} options - Opciones de consulta (where, order, page, pageSize).
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Categorías y conteo total.
   */
  async getBadgeCategories({ where = {}, order = [['badge_category_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
    const offset = (page - 1) * pageSize;

    const { count, rows } = await BadgeCategory.findAndCountAll({
      where,
      order,
      limit: pageSize,
      offset,
      transaction
    });

    return { count, rows };
  }

  /**
   * Obtiene una categoría de insignias por ID.
   * @param {number} id - ID de la categoría.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object|null} Categoría encontrada o null.
   */
  async getBadgeCategoryById(id, transaction = null) {
    const badgeCategory = await BadgeCategory.findByPk(id, { transaction });
    if (!badgeCategory || !badgeCategory.is_active) return null;
    return badgeCategory;
  }

  /**
   * Crea una nueva categoría de insignias.
   * @param {Object} badgeCategoryData - Datos de la categoría.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Categoría creada.
   */
  async createBadgeCategory(badgeCategoryData, transaction = null) {
    const { name, description } = badgeCategoryData;

    const existingCategory = await BadgeCategory.findOne({
      where: { name },
      transaction
    });
    if (existingCategory) {
      throw new Error('El nombre de la categoría ya está en uso');
    }

    const badgeCategory = await BadgeCategory.create({
      name,
      description,
      is_active: true
    }, { transaction });

    return await this.getBadgeCategoryById(badgeCategory.badge_category_id, transaction);
  }

  /**
   * Actualiza una categoría de insignias existente.
   * @param {number} id - ID de la categoría.
   * @param {Object} data - Datos a actualizar.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Categoría actualizada.
   */
  async updateBadgeCategory(id, data, transaction = null) {
    const badgeCategory = await BadgeCategory.findByPk(id, { transaction });
    if (!badgeCategory) {
      throw new Error('Categoría no encontrada');
    }
    if (!badgeCategory.is_active) {
      throw new Error('No se puede actualizar una categoría inactiva');
    }

    const { name, description } = data;

    if (name && name !== badgeCategory.name) {
      const existingCategory = await BadgeCategory.findOne({
        where: { name, badge_category_id: { [Op.ne]: id } },
        transaction
      });
      if (existingCategory) {
        throw new Error('El nombre de la categoría ya está en uso');
      }
    }

    await badgeCategory.update({
      name: name || badgeCategory.name,
      description: description !== undefined ? description : badgeCategory.description
    }, { transaction });

    return await this.getBadgeCategoryById(id, transaction);
  }

  /**
   * Desactiva una categoría de insignias (eliminación lógica).
   * @param {number} id - ID de la categoría.
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Mensaje de confirmación.
   */
  async deleteBadgeCategory(id, transaction = null) {
    const badgeCategory = await BadgeCategory.findByPk(id, { transaction });
    if (!badgeCategory) {
      throw new Error('Categoría no encontrada');
    }

    await badgeCategory.update({ is_active: false }, { transaction });
    return { message: 'Categoría desactivada exitosamente' };
  }
}

module.exports = BadgeCategoryService;