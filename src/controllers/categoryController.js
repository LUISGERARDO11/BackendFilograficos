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

// Obtener todas las categorías
exports.getAllCategories = async (req, res) => {
  try {
    const categories = await Category.findAll();
    res.status(200).json(categories);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// Eliminar categoría (física)
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    await category.destroy();
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Categoría eliminada: ${category.name}`);
    res.status(200).json({ message: 'Categoría eliminada correctamente.' });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar categoría', error: error.message });
  }
};
