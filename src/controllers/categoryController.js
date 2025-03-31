const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const loggerUtils = require('../utils/loggerUtils');

// Crear nueva categoría
exports.createCategory = [
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('description').optional().isString(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, description } = req.body;

      // Verificar si la categoría ya existe
      const existingCategory = await Category.findOne({ where: { name } });
      if (existingCategory) {
        return res.status(400).json({ message: 'La categoría ya existe.' });
      }

      const newCategory = await Category.create({ name, description });
      loggerUtils.logUserActivity(req.user.user_id, 'create', `Categoría creada: ${name}`);
      res.status(201).json({ message: 'Categoría creada exitosamente.', category: newCategory });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear categoría', error: error.message });
    }
  }
];

// Obtener todas las categorías activas
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { active: true },
      attributes: ['category_id', 'name'],
      order: [['created_at', 'DESC']]
    });

    res.status(200).json(categories);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// Obtener todas las categorías
exports.getAllCategories = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam, active, name, sortBy, sortOrder } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos'
      });
    }

    // Construir el objeto where dinámicamente
    const whereClause = {};

    // Filtro por estado (active) extraído como declaración independiente
    if (active !== undefined) {
      let activeValue;
      if (active === 'true') {
        activeValue = true;
      } else if (active === 'false') {
        activeValue = false;
      } else {
        activeValue = undefined;
      }
      whereClause.active = activeValue;
    }

    // Filtro por nombre (búsqueda parcial con LIKE)
    if (name) {
      whereClause.name = { [Op.like]: `%${name}%` };
    }

    const validSortFields = ['name'];
    const order = sortBy && validSortFields.includes(sortBy)
      ? [[sortBy, sortOrder === 'ASC' ? 'ASC' : 'DESC']]
      : [['created_at', 'DESC']];

    const { count, rows: categories } = await Category.findAndCountAll({
      where: whereClause,
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.status(200).json({
      categories,
      total: count,
      page,
      pageSize
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// Obtener una categoría por su ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada.' });
    }
    res.status(200).json(category);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la categoría', error: error.message });
  }
};

// Eliminación lógica de categoría
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    await category.update({ active: false });
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Categoría desactivada: ${category.name}`);
    res.status(200).json({ message: 'Categoría desactivada correctamente.' });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al desactivar la categoría', error: error.message });
  }
};

// Actualizar categoría por ID
exports.updateCategory = [
  body('name').optional().isString().trim(),
  body('description').optional().isString(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return res.status(404).json({ message: 'Categoría no encontrada.' });
      }

      const { name, description } = req.body;

      // Actualizar los campos de la categoría si se pasan
      if (name) category.name = name;
      if (description) category.description = description;

      await category.save();
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Categoría actualizada: ${category.name}`);
      res.status(200).json({ message: 'Categoría actualizada correctamente.', category });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la categoría', error: error.message });
    }
  }
];