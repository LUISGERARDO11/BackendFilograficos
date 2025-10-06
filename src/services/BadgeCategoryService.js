const { Op } = require('sequelize');
// **[ACTUALIZADO]** Importar el modelo Badge
const { BadgeCategory, Badge } = require('../models/Associations'); 
const loggerUtils = require('../utils/loggerUtils');

class BadgeCategoryService {
  /**
   * Obtiene todas las categorías de insignias con paginación y filtros.
   * @param {Object} options - Opciones de consulta (where, order, page, pageSize, badgeNameFilter).
   * @param {Object|null} transaction - Transacción de Sequelize (opcional).
   * @returns {Object} Categorías y conteo total.
   */
  async getBadgeCategories({ where = {}, order = [['badge_category_id', 'ASC']], page = 1, pageSize = 10, badgeNameFilter = null } = {}, transaction = null) {
    const offset = (page - 1) * pageSize;

    // Configuración de inclusión de Insignias
    let include = [{
        model: Badge,
        as: 'Badges', // El alias es 'Badges' según tus asociaciones
        attributes: ['badge_id', 'name', 'icon_url', 'is_active', 'created_at'],
        required: false // LEFT JOIN por defecto
    }];

    // Lógica para filtrar por nombre de insignia
    if (badgeNameFilter) {
        // Hace la inclusión obligatoria (INNER JOIN) y aplica el filtro por nombre de insignia
        include[0].required = true;
        include[0].where = {
            name: { [Op.like]: `%${badgeNameFilter}%` },
        };
    }

    const { count, rows } = await BadgeCategory.findAndCountAll({
      where, // Aquí se aplica el filtro is_active enviado desde el controlador
      order,
      limit: pageSize,
      offset,
      include, // Incluir las insignias
        // CORRECCIÓN CLAVE PARA EL CONTEO INCORRECTO:
        distinct: true,
        subQuery: false,
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
    // **[ACTUALIZADO]** Incluir Insignias en la consulta por ID
    const badgeCategory = await BadgeCategory.findByPk(id, { 
        include: [{
            model: Badge,
            as: 'Badges',
            attributes: ['badge_id', 'name', 'icon_url', 'is_active', 'created_at']
        }],
        transaction 
    });
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

    // **[NUEVO MÉTODO]** Reporte de distribución de insignias
    /**
     * Genera un reporte básico de distribución de insignias por categoría.
     * @param {Object|null} transaction - Transacción de Sequelize (opcional).
     * @returns {Array} Reporte de distribución.
     */
    async getBadgeDistributionReport(transaction = null) {
        // Utiliza COUNT con GROUP BY para obtener el número de insignias por categoría.
        const report = await BadgeCategory.findAll({
            attributes: [
                'badge_category_id',
                'name',
                [Badge.sequelize.fn('COUNT', Badge.sequelize.col('Badges.badge_id')), 'badge_count']
            ],
            include: [{
                model: Badge,
                as: 'Badges',
                attributes: [], 
                required: false // Incluye categorías sin insignias
            }],
            group: ['BadgeCategory.badge_category_id', 'BadgeCategory.name'],
            order: [[Badge.sequelize.literal('badge_count'), 'DESC']],
            where: { is_active: true }, 
            raw: true, 
            transaction
        });

        return report.map(item => ({
            category_id: item.badge_category_id,
            category_name: item.name,
            total_badges: parseInt(item.badge_count) 
        }));
    }
}

module.exports = BadgeCategoryService;