const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const BadgeCategoryService = require('../services/BadgeCategoryService');
const { BadgeCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

const badgeCategoryService = new BadgeCategoryService();

// Validaciones para getAllBadgeCategories
const validateGetAllBadgeCategories = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
  query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "badge_category_id:ASC,name:DESC").'),
  query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.'),
  query('statusFilter').optional().isIn(['active', 'inactive', 'all']).withMessage('El filtro de estado debe ser "active", "inactive" o "all".'),
  query('badgeName').optional().isString().withMessage('El término de búsqueda de insignia debe ser una cadena.')
];

// Validaciones para createBadgeCategory
const validateCreateBadgeCategory = [
  body('name').notEmpty().trim().withMessage('El nombre es obligatorio'),
  body('description').optional().isString().trim().withMessage('La descripción debe ser una cadena')
];

// Validaciones para updateBadgeCategory
const validateUpdateBadgeCategory = [
  body('name').optional().notEmpty().trim().withMessage('El nombre no puede estar vacío'),
  body('description').optional().isString().trim().withMessage('La descripción debe ser una cadena')
];

// Obtener todas las categorías de insignias
exports.getAllBadgeCategories = [
  validateGetAllBadgeCategories,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      // **[CORRECCIÓN DE ERRORES]** Sintaxis de desestructuración correcta:
      const { search, page = 1, pageSize = 10, sort, statusFilter = 'active', badgeName } = req.query; 
      const pageInt = parseInt(page);
      const pageSizeInt = parseInt(pageSize);

      if (pageInt < 1 || pageSizeInt < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos' });
      }

      const where = {};
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { description: { [Op.like]: `%${search}%` } }
        ];
      }

      if (statusFilter !== 'all') {
        where.is_active = statusFilter === 'active';
      }

      let order = [['badge_category_id', 'ASC']];
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['badge_category_id', 'name', 'created_at', 'updated_at'];
        order = sortParams
          .filter(([column]) => validColumns.includes(column))
          .map(([column, direction]) => [column, direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC']);
      }

      const { count, rows: badgeCategories } = await badgeCategoryService.getBadgeCategories({
        where,
        order,
        page: pageInt,
        pageSize: pageSizeInt,
        badgeNameFilter: badgeName
      });

      const formattedBadgeCategories = badgeCategories.map(category => ({
        badge_category_id: category.badge_category_id,
        name: category.name,
        description: category.description,
        is_active: category.is_active,
        created_at: category.created_at,
        updated_at: category.updated_at,
        // **[CORRECCIÓN DE ERRORES]** Sintaxis de mapeo correcta (remueve las estrellas)
        badges: category.Badges ? category.Badges.map(badge => ({ 
            badge_id: badge.badge_id,
            name: badge.name,
            icon_url: badge.icon_url,
            is_active: badge.is_active
        })) : []
      }));

      res.status(200).json({
        message: 'Categorías de insignias obtenidas exitosamente',
        badgeCategories: formattedBadgeCategories,
        total: count,
        page: pageInt,
        pageSize: pageSizeInt
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las categorías de insignias', error: error.message });
    }
  }
];

// Obtener una categoría de insignias por ID
exports.getBadgeCategoryById = async (req, res) => {
  const { id } = req.params;

  try {
    const badgeCategory = await badgeCategoryService.getBadgeCategoryById(id);
    if (!badgeCategory) {
      return res.status(404).json({ message: 'Categoría de insignias no encontrada o inactiva' });
    }

    res.status(200).json({
      message: 'Categoría de insignias obtenida exitosamente',
      badgeCategory: {
        badge_category_id: badgeCategory.badge_category_id,
        name: badgeCategory.name,
        description: badgeCategory.description,
        is_active: badgeCategory.is_active,
        created_at: badgeCategory.created_at,
        updated_at: badgeCategory.updated_at,
        // **[CORRECCIÓN DE ERRORES]** Sintaxis de mapeo correcta (remueve las estrellas)
        badges: badgeCategory.Badges ? badgeCategory.Badges.map(badge => ({ 
            badge_id: badge.badge_id,
            name: badge.name,
            icon_url: badge.icon_url,
            is_active: badge.is_active
        })) : []
      }
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la categoría de insignias', error: error.message });
  }
};

// Crear una categoría de insignias
exports.createBadgeCategory = [
  validateCreateBadgeCategory,
  async (req, res) => {
    const transaction = await BadgeCategory.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { name, description } = req.body;
      const badgeCategoryData = { name, description };

      const newBadgeCategory = await badgeCategoryService.createBadgeCategory(badgeCategoryData, transaction);
      await transaction.commit();

      loggerUtils.logUserActivity(req.user.user_id, 'create_badge_category', `Categoría de insignias creada: ${newBadgeCategory.badge_category_id}`);

      res.status(201).json({
        message: 'Categoría de insignias creada exitosamente',
        badgeCategory: {
          badge_category_id: newBadgeCategory.badge_category_id,
          name: newBadgeCategory.name,
          description: newBadgeCategory.description,
          is_active: newBadgeCategory.is_active,
          created_at: newBadgeCategory.created_at,
          updated_at: newBadgeCategory.updated_at
        }
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la categoría de insignias', error: error.message });
    }
  }
];

// Actualizar una categoría de insignias
exports.updateBadgeCategory = [
  validateUpdateBadgeCategory,
  async (req, res) => {
    const transaction = await BadgeCategory.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { id } = req.params;
      const { name, description } = req.body;

      const badgeCategory = await badgeCategoryService.updateBadgeCategory(id, { name, description }, transaction);
      if (!badgeCategory) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Categoría de insignias no encontrada' });
      }

      await transaction.commit();
      loggerUtils.logUserActivity(req.user.user_id, 'update_badge_category', `Categoría de insignias actualizada: ${id}`);

      res.status(200).json({
        message: 'Categoría de insignias actualizada exitosamente',
        badgeCategory: {
          badge_category_id: badgeCategory.badge_category_id,
          name: badgeCategory.name,
          description: badgeCategory.description,
          is_active: badgeCategory.is_active,
          created_at: badgeCategory.created_at,
          updated_at: badgeCategory.updated_at
        }
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la categoría de insignias', error: error.message });
    }
  }
];

// Eliminar una categoría de insignias (eliminación lógica)
exports.deleteBadgeCategory = async (req, res) => {
  const { id } = req.params;
  const transaction = await BadgeCategory.sequelize.transaction();

  try {
    const result = await badgeCategoryService.deleteBadgeCategory(id, transaction);
    await transaction.commit();
    loggerUtils.logUserActivity(req.user.user_id, 'delete_badge_category', `Categoría de insignias desactivada: ${id}`);

    res.status(200).json(result);
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al desactivar la categoría de insignias', error: error.message });
  }
};

// Obtener Reporte de Distribución de Insignias
exports.getBadgeDistributionReport = async (req, res) => {
  try {
    const report = await badgeCategoryService.getBadgeDistributionReport();

    res.status(200).json({
      message: 'Reporte de distribución de insignias generado exitosamente',
      report
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al generar el reporte de distribución de insignias', error: error.message });
  }
};