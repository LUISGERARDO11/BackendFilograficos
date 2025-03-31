/* This JavaScript code snippet defines a set of functions related to managing FAQ categories in an
application. Here's a breakdown of what each part of the code does: */
const { body, validationResult } = require('express-validator');
const { FaqCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

// Crear categoría de FAQ
exports.createFaqCategory = [
  // Validaciones de entrada
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('description').optional().isString().trim(),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      loggerUtils.logCriticalError(new Error('Errores de validación al crear la categoría de FAQ.'));
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description } = req.body;
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    try {
      // Verificar si la categoría ya existe
      const existingCategory = await FaqCategory.findOne({ where: { name } });
      if (existingCategory) {
        loggerUtils.logUserActivity(userId, 'create', 'Intento de crear una categoría de FAQ con nombre duplicado.');
        return res.status(400).json({ message: 'El nombre de la categoría ya existe.' });
      }

      // Crear una nueva categoría de FAQ
      const newFaqCategory = await FaqCategory.create({
        name,
        description
      });

      loggerUtils.logUserActivity(userId, 'create', `Categoría de FAQ creada: ${name}.`);
      res.status(201).json({ message: 'Categoría de FAQ creada exitosamente.', faqCategory: newFaqCategory });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la categoría de FAQ.', error: error.message });
    }
  },
];

// Obtener categoría de FAQ por ID
exports.getFaqCategoryById = async (req, res) => {
  const { id } = req.params;

  try {
    const faqCategory = await FaqCategory.findByPk(id);
    if (!faqCategory) {
      loggerUtils.logUserActivity(req.user?.user_id, 'view', `Intento fallido de obtener categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    loggerUtils.logUserActivity(req.user?.user_id, 'view', `Obtenida categoría de FAQ: ${faqCategory.name}.`);
    res.status(200).json({ faqCategory });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la categoría de FAQ.', error: error.message });
  }
};

// Obtener todas las categorías activas de FAQ
exports.getAllFaqCategories = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = '' } = req.query;

    // Convertir parámetros a enteros y validar
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    if (isNaN(pageNum) || isNaN(pageSizeNum) || pageNum < 1 || pageSizeNum < 1) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos.',
      });
    }

    // Construir la condición de búsqueda parcial
    const whereClause = {
      status: 'active', // Solo categorías activas
    };

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } }, // Búsqueda parcial en nombre (case-insensitive)
        { description: { [Op.like]: `%${search}%` } }, // Búsqueda parcial en descripción
      ];
    }

    // Obtener categorías con paginación
    const { count, rows } = await FaqCategory.findAndCountAll({
      where: whereClause,
      attributes: ['category_id', 'name', 'description', 'created_at', 'updated_at'], // Excluimos 'status'
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
      order: [['name', 'ASC']], // Ordenar por nombre ascendente
    });

    // Registrar el acceso a la información
    loggerUtils.logUserActivity(req.user?.user_id, 'view', 'Obtenidas todas las categorías de FAQ activas.');

    res.status(200).json({
      faqCategories: rows,
      total: count,
      page: pageNum,
      pageSize: pageSizeNum,
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las categorías de FAQ.', error: error.message });
  }
};

// Obtener ID, nombre y ruta de todas las categorías activas de FAQ (público)
exports.getFaqCategories = async (req, res) => {
  try {
    // Obtener todas las categorías activas
    const faqCategories = await FaqCategory.findAll({
      where: { status: 'active' },
      attributes: ['category_id', 'name'], // Solo seleccionamos id y nombre
      order: [['name', 'ASC']], // Ordenar por nombre ascendente
    });

    // Construir la respuesta con la ruta
    const categoriesWithPath = faqCategories.map(category => ({
      id: category.category_id,
      name: category.name,
      path: `/faq/category/${category.category_id}`, // Ruta relativa para cada categoría
    }));

    // No se registra actividad de usuario ya que es público
    res.status(200).json({
      faqCategories: categoriesWithPath,
      total: categoriesWithPath.length,
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las categorías de FAQ públicas.', error: error.message });
  }
};

// Actualizar categoría de FAQ
exports.updateFaqCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const userId = req.user?.user_id;
  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado.' });
  }

  try {
    // Buscar y actualizar la categoría de FAQ
    const [updatedRows] = await FaqCategory.update(
      {
        name,
        description,
      },
      {
        where: { category_id: id },
        returning: true,
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(userId, 'update', `Intento fallido de actualizar categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    // Obtener la categoría de FAQ actualizada
    const updatedFaqCategory = await FaqCategory.findByPk(id);
    loggerUtils.logUserActivity(userId, 'update', `Categoría de FAQ actualizada: ${name}.`);
    res.status(200).json({ message: 'Categoría de FAQ actualizada exitosamente.', faqCategory: updatedFaqCategory });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar la categoría de FAQ.', error: error.message });
  }
};

// Eliminación lógica de categoría de FAQ
exports.deleteFaqCategory = async (req, res) => {
  const { id } = req.params;

  const userId = req.user?.user_id;
  if (!userId) {
    return res.status(401).json({ message: 'Usuario no autenticado.' });
  }

  try {
    // Buscar y marcar como inactivo (eliminación lógica)
    const [updatedRows] = await FaqCategory.update(
      { status: 'inactive' },
      {
        where: { category_id: id },
        returning: true,
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(userId, 'delete', `Intento fallido de eliminar categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    const deletedFaqCategory = await FaqCategory.findByPk(id);
    loggerUtils.logUserActivity(userId, 'delete', `Categoría de FAQ eliminada: ${deletedFaqCategory.name}.`);
    res.status(200).json({ message: 'Categoría de FAQ eliminada exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la categoría de FAQ.', error: error.message });
  }
};