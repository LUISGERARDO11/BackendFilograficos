const { Op, fn, col } = require('sequelize');
const { body, query, param, validationResult } = require('express-validator');
const BadgeService = require('../services/BadgeService');
const { BadgeCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');

const badgeService = new BadgeService();

// Validaciones de esquema
const validateGetAllBadges = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
  query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "badge_id:ASC,name:DESC").'),
  query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.'),
  query('statusFilter').optional().isIn(['active', 'inactive', 'all']).withMessage('El filtro de estado debe ser "active", "inactive" o "all".')
];

const validateCreateBadge = [
  body('name').notEmpty().trim().withMessage('El nombre es obligatorio'),
  body('description').optional().isString().trim().withMessage('La descripción debe ser una cadena'),
  body('badge_category_id').isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número entero positivo')
];

const validateUpdateBadge = [
  body('name').optional().notEmpty().trim().withMessage('El nombre no puede estar vacío'),
  body('description').optional().isString().trim().withMessage('La descripción debe ser una cadena'),
  body('badge_category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número entero positivo')
];

const validateGetBadgeCategoriesWithCount = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
  query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "badge_category_id:ASC,name:DESC").'),
  query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.'),
  query('statusFilter').optional().isIn(['active', 'inactive', 'all']).withMessage('El filtro de estado debe ser "active", "inactive" o "all".')
];

const validateGetGrantedBadgesHistory = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
  query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "obtained_at:DESC").'),
  query('userId').optional().isInt({ min: 1 }).withMessage('El ID de usuario debe ser un número entero positivo.'),
  query('badgeId').optional().isInt({ min: 1 }).withMessage('El ID de insignia debe ser un número entero positivo.'),
  query('badgeCategoryId').optional().isInt({ min: 1 }).withMessage('El ID de categoría debe ser un número entero positivo.'), // NUEVO
  query('startDate').optional().isISO8601().withMessage('La fecha de inicio debe ser una fecha ISO válida (YYYY-MM-DD).'),
  query('endDate').optional().isISO8601().withMessage('La fecha de fin debe ser una fecha ISO válida (YYYY-MM-DD).'),
  query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.') // Asegurado para user_id si es string
];

// NUEVA VALIDACIÓN para métricas
const validateGetBadgeMetrics = [];

// NUEVA VALIDACIÓN para tendencias
const validateGetAcquisitionTrend = [
  query('days').optional().isInt({ min: 1, max: 365 }).withMessage('Los días deben ser un número entre 1 y 365.')
];

// Métodos del controlador
exports.getAllBadges = [
  validateGetAllBadges,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { search, page = 1, pageSize = 10, sort, statusFilter = 'active' } = req.query;
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

      let order = [['badge_id', 'ASC']];
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['badge_id', 'name', 'created_at', 'updated_at'];
        order = sortParams
          .filter(([column]) => validColumns.includes(column))
          .map(([column, direction]) => [column, direction.toUpperCase() === 'DESC' ? 'DESC' : 'ASC']);
      }

      const { count, rows: badges } = await badgeService.getBadges({
        where,
        order,
        page: pageInt,
        pageSize: pageSizeInt
      });

      const formattedBadges = badges.map(badge => ({
        badge_id: badge.badge_id,
        name: badge.name,
        description: badge.description,
        icon_url: badge.icon_url,
        public_id: badge.public_id,
        badge_category_id: badge.badge_category_id,
        category_name: badge.BadgeCategory ? badge.BadgeCategory.name : null,
        is_active: badge.is_active,
        created_at: badge.created_at,
        updated_at: badge.updated_at
      }));

      res.status(200).json({
        message: 'Insignias obtenidas exitosamente',
        badges: formattedBadges,
        total: count,
        page: pageInt,
        pageSize: pageSizeInt
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las insignias', error: error.message });
    }
  }
];

// NUEVO: Obtener insignias activas (solo id y nombre)
exports.getActiveBadges = async (req, res) => {
  try {
    const activeBadges = await badgeService.getActiveBadges();

    // Si no hay insignias activas
    if (!activeBadges || activeBadges.length === 0) {
      return res.status(404).json({ message: 'No hay insignias activas disponibles' });
    }

    // Formateo para asegurar estructura uniforme
    const formattedBadges = activeBadges.map(badge => ({
      badge_id: badge.badge_id,
      name: badge.name
    }));

    res.status(200).json({
      message: 'Insignias activas obtenidas exitosamente',
      badges: formattedBadges,
      total: formattedBadges.length
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las insignias activas', error: error.message });
  }
};


exports.getBadgeById = async (req, res) => {
  const { id } = req.params;

  try {
    const badge = await badgeService.getBadgeById(id);
    if (!badge) {
      return res.status(404).json({ message: 'Insignia no encontrada o inactiva' });
    }

    res.status(200).json({
      message: 'Insignia obtenida exitosamente',
      badge: {
        badge_id: badge.badge_id,
        name: badge.name,
        description: badge.description,
        icon_url: badge.icon_url,
        public_id: badge.public_id,
        badge_category_id: badge.badge_category_id,
        category_name: badge.BadgeCategory ? badge.BadgeCategory.name : null,
        is_active: badge.is_active,
        created_at: badge.created_at,
        updated_at: badge.updated_at
      }
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la insignia', error: error.message });
  }
};

exports.createBadge = [
  validateCreateBadge,
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      if (!req.file) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Debe subir una imagen para la insignia' });
      }

      const { name, description, badge_category_id } = req.body;
      const badgeData = { name, description, badge_category_id };

      const newBadge = await badgeService.createBadge(badgeData, req.file.buffer, transaction);
      await transaction.commit();

      loggerUtils.logUserActivity(req.user.user_id, 'create_badge', `Insignia creada: ${newBadge.badge_id}`);

      res.status(201).json({
        message: 'Insignia creada exitosamente',
        badge: {
          badge_id: newBadge.badge_id,
          name: newBadge.name,
          description: newBadge.description,
          icon_url: newBadge.icon_url,
          public_id: newBadge.public_id,
          badge_category_id: newBadge.badge_category_id,
          category_name: newBadge.BadgeCategory ? newBadge.BadgeCategory.name : null,
          is_active: newBadge.is_active,
          created_at: newBadge.created_at,
          updated_at: newBadge.updated_at
        }
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la insignia', error: error.message });
    }
  }
];

exports.updateBadge = [
  validateUpdateBadge,
  async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { id } = req.params;
      const { name, description, badge_category_id } = req.body;

      const badge = await badgeService.updateBadge(
        id,
        { name, description, badge_category_id },
        req.file ? req.file.buffer : null,
        transaction
      );

      if (!badge) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Insignia no encontrada' });
      }

      await transaction.commit();
      loggerUtils.logUserActivity(req.user.user_id, 'update_badge', `Insignia actualizada: ${id}`);

      res.status(200).json({
        message: 'Insignia actualizada exitosamente',
        badge: {
          badge_id: badge.badge_id,
          name: badge.name,
          description: badge.description,
          icon_url: badge.icon_url,
          public_id: badge.public_id,
          badge_category_id: badge.badge_category_id,
          category_name: badge.BadgeCategory ? badge.BadgeCategory.name : null,
          is_active: badge.is_active,
          created_at: badge.created_at,
          updated_at: badge.updated_at
        }
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la insignia', error: error.message });
    }
  }
];

exports.deleteBadge = async (req, res) => {
  const { id } = req.params;
  const transaction = await sequelize.transaction();

  try {
    const result = await badgeService.deleteBadge(id, transaction);

    if (result.deletedCount === 0) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Insignia no encontrada para desactivar' });
    }

    await transaction.commit();
    loggerUtils.logUserActivity(req.user.user_id, 'delete_badge', `Insignia desactivada: ${id}`);

    res.status(200).json(result);
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al desactivar la insignia', error: error.message });
  }
};

exports.getBadgeCategoriesWithCount = [
  validateGetBadgeCategoriesWithCount,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { search, page = 1, pageSize = 10, sort, statusFilter = 'active' } = req.query;
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

      const { count, rows: categories } = await badgeService.getBadgeCategoriesWithCount({
        where,
        order,
        page: pageInt,
        pageSize: pageSizeInt
      });

      const formattedCategories = categories.map(category => ({
        badge_category_id: category.badge_category_id,
        name: category.name,
        description: category.description,
        is_active: category.is_active,
        created_at: category.created_at,
        updated_at: category.updated_at,
        badge_count: parseInt(category.getDataValue('badge_count') || 0)
      }));

      res.status(200).json({
        message: 'Categorías de insignias obtenidas exitosamente',
        badgeCategories: formattedCategories,
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

exports.getGrantedBadgesHistory = [
  validateGetGrantedBadgesHistory,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { page = 1, pageSize = 10, sort, userId, badgeId, badgeCategoryId, startDate, endDate, search } = req.query;
      const pageInt = parseInt(page);
      const pageSizeInt = parseInt(pageSize);

      if (pageInt < 1 || pageSizeInt < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos' });
      }

      // La lógica de ordenación por defecto puede cambiar a 'total_badges' o 'last_obtained_at' en el servicio.
      // Por ahora, pasamos el sort tal cual para que el servicio decida la columna de ordenación para los grupos.
      let order = sort; 

      const { totalUsers: count, groupedHistory: history } = await badgeService.getGrantedBadgesHistory({
        search,
        user_id: userId, // Mantengo el filtro por userId
        badge_id: badgeId,
        badge_category_id: badgeCategoryId,
        start_date: startDate,
        end_date: endDate,
        order,
        page: pageInt,
        pageSize: pageSizeInt
      }) || { totalUsers: 0, groupedHistory: [] };

      // Los datos ya vienen pre-formateados y agrupados por el servicio,
      // por lo que el mapeo es mínimo, solo para asegurar el formato de respuesta final.
      const formattedHistory = history.map(userGroup => ({
        user_id: userGroup.user_id,
        user_email: userGroup.user_email,
        user_name: userGroup.user_name,
        total_badges: userGroup.total_badges,
        last_obtained_at: userGroup.last_obtained_at,
        badges: userGroup.badges, // Lista de insignias obtenidas
      }));

      res.status(200).json({
        message: 'Historial de insignias otorgadas (paginado por usuario) obtenido exitosamente',
        history: formattedHistory,
        total: count, // Total de usuarios únicos
        page: pageInt,
        pageSize: pageSizeInt
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener el historial de insignias', error: error.message });
    }
  }
];

// NUEVO: Controlador para métricas
exports.getBadgeMetrics = [
  validateGetBadgeMetrics,
  async (req, res) => {
    try {
      const metrics = await badgeService.getBadgeMetrics();

      res.status(200).json({
        message: 'Métricas de insignias obtenidas exitosamente',
        metrics
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las métricas', error: error.message });
    }
  }
];

// NUEVO: Controlador para tendencias
exports.getAcquisitionTrend = [
  validateGetAcquisitionTrend,
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const trendData = await badgeService.getAcquisitionTrend(parseInt(days));

      res.status(200).json({
        message: 'Tendencias de adquisición obtenidas exitosamente',
        trend: trendData
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las tendencias', error: error.message });
    }
  }
];