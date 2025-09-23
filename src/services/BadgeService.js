const { Op } = require('sequelize');
const { Badge, BadgeCategory } = require('../models/Associations');
const { uploadBadgeIconToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const loggerUtils = require('../utils/loggerUtils');

class BadgeService {
  async getBadges({ where = {}, order = [['badge_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
    const offset = (page - 1) * pageSize;

    const { count, rows } = await Badge.findAndCountAll({
      where,
      order,
      limit: pageSize,
      offset,
      include: [{ model: BadgeCategory, attributes: ['name'] }],
      transaction
    });

    return { count, rows };
  }

  async getBadgeById(id, transaction = null) {
    const badge = await Badge.findByPk(id, {
      include: [{ model: BadgeCategory, attributes: ['name'] }],
      transaction
    });
    if (!badge || !badge.is_active) return null;
    return badge;
  }

  async createBadge(badgeData, fileBuffer, transaction = null) {
    const { name, description, badge_category_id } = badgeData;

    const existingBadge = await Badge.findOne({
      where: { name },
      transaction
    });
    if (existingBadge) {
      throw new Error('El nombre de la insignia ya está en uso');
    }

    const category = await BadgeCategory.findByPk(badge_category_id, { transaction });
    if (!category || !category.is_active) {
      throw new Error('La categoría no existe o está inactiva');
    }

    const result = await uploadBadgeIconToCloudinary(fileBuffer, name);
    const badge = await Badge.create({
      name,
      description,
      icon_url: result.secure_url,
      public_id: result.public_id,
      badge_category_id,
      is_active: true
    }, { transaction });

    return await this.getBadgeById(badge.badge_id, transaction);
  }

  async updateBadge(id, data, fileBuffer, transaction = null) {
    const badge = await Badge.findByPk(id, { transaction });
    if (!badge) {
      throw new Error('Insignia no encontrada');
    }
    if (!badge.is_active) {
      throw new Error('No se puede actualizar una insignia inactiva');
    }

    const { name, description, badge_category_id } = data;

    if (name && name !== badge.name) {
      const existingBadge = await Badge.findOne({
        where: { name, badge_id: { [Op.ne]: id } },
        transaction
      });
      if (existingBadge) {
        throw new Error('El nombre de la insignia ya está en uso');
      }
    }

    if (badge_category_id) {
      const category = await BadgeCategory.findByPk(badge_category_id, { transaction });
      if (!category || !category.is_active) {
        throw new Error('La categoría no existe o está inactiva');
      }
    }

    let icon_url = badge.icon_url;
    let public_id = badge.public_id;

    if (fileBuffer) {
      await deleteFromCloudinary(badge.public_id);
      const result = await uploadBadgeIconToCloudinary(fileBuffer, name || badge.name);
      icon_url = result.secure_url;
      public_id = result.public_id;
    }

    await badge.update({
      name: name || badge.name,
      description: description !== undefined ? description : badge.description,
      icon_url,
      public_id,
      badge_category_id: badge_category_id || badge.badge_category_id
    }, { transaction });

    return await this.getBadgeById(id, transaction);
  }

  async deleteBadge(id, transaction = null) {
    const badge = await Badge.findByPk(id, { transaction });
    if (!badge) {
      throw new Error('Insignia no encontrada');
    }

    await deleteFromCloudinary(badge.public_id);
    await badge.update({ is_active: false }, { transaction });
    return { message: 'Insignia desactivada exitosamente' };
  }

  async getBadgeCategoriesWithCount({ where = {}, order = [['badge_category_id', 'ASC']], page = 1, pageSize = 10 } = {}, transaction = null) {
    const offset = (page - 1) * pageSize;

    const { count, rows } = await BadgeCategory.findAndCountAll({
      where,
      order,
      limit: pageSize,
      offset,
      attributes: {
        include: [
          [sequelize.fn('COUNT', sequelize.col('badges.badge_id')), 'badge_count']
        ]
      },
      include: [{
        model: Badge,
        attributes: [],
        required: false
      }],
      group: ['BadgeCategory.badge_category_id'],
      transaction
    });

    return { count: count.length, rows };
  }
}

module.exports = BadgeService;