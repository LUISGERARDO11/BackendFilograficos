/* This JavaScript code snippet defines a set of functions related to managing FAQ categories in an
application. Here's a breakdown of what each part of the code does: */
const { body, validationResult } = require('express-validator');
const { FaqCategory } = require('../models/Associations')
const loggerUtils = require('../utils/loggerUtils');


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

    // Verificar que req.user.user_id tiene el ID del usuario
    if (!req.user || !req.user.user_id) {
      return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    try {
      // Verificar si la categoría ya existe
      const existingCategory = await FaqCategory.findOne({ where: { name } });
      if (existingCategory) {
        loggerUtils.logUserActivity(req.user.user_id, 'create', 'Intento de crear una categoría de FAQ con nombre duplicado.');
        return res.status(400).json({ message: 'El nombre de la categoría ya existe.' });
      }

      // Crear una nueva categoría de FAQ
      const newFaqCategory = await FaqCategory.create({
        name,
        description,
        created_by: req.user.user_id
      });

      // Registrar la creación en el logger
      loggerUtils.logUserActivity(req.user.user_id, 'create', `Categoría de FAQ creada: ${name}.`);

      res.status(201).json({ message: 'Categoría de FAQ creada exitosamente.', faqCategory: newFaqCategory });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la categoría de FAQ.', error: error.message });
    }
  }
];

// Obtener categoría de FAQ por ID
exports.getFaqCategoryById = async (req, res) => {
  const { id } = req.params;

  try {
    const faqCategory = await FaqCategory.findByPk(id);
    if (!faqCategory) {
      loggerUtils.logUserActivity(req.user.user_id, 'view', `Intento fallido de obtener categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    // Registrar el acceso a la información
    loggerUtils.logUserActivity(req.user.user_id, 'view', `Obtenida categoría de FAQ: ${faqCategory.name}.`);

    res.status(200).json({ faqCategory });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la categoría de FAQ.', error: error.message });
  }
};

// Obtener todas las categorías activas de FAQ
exports.getAllFaqCategories = async (req, res) => {
  try {
    const faqCategories = await FaqCategory.findAll({
      where: { status: active }
    });

    // Registrar el acceso a la información
    loggerUtils.logUserActivity(req.user.user_id, 'view', 'Obtenidas todas las categorías de FAQ activas.');

    res.status(200).json({ faqCategories });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las categorías de FAQ.', error: error.message });
  }
};

// Actualizar categoría de FAQ
exports.updateFaqCategory = async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  try {
    // Buscar y actualizar la categoría de FAQ
    const [updatedRows] = await FaqCategory.update(
      {
        name,
        description,
        updated_by: req.user.user_id
      },
      {
        where: { category_id: id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Intento fallido de actualizar categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    // Obtener la categoría de FAQ actualizada
    const updatedFaqCategory = await FaqCategory.findByPk(id);

    // Registrar la actualización en el logger
    loggerUtils.logUserActivity(req.user.user_id, 'update', `Categoría de FAQ actualizada: ${name}.`);

    res.status(200).json({ message: 'Categoría de FAQ actualizada exitosamente.', faqCategory: updatedFaqCategory });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar la categoría de FAQ.', error: error.message });
  }
};

// Eliminación lógica de categoría de FAQ
exports.deleteFaqCategory = async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar y marcar como inactivo (eliminación lógica)
    const [updatedRows] = await FaqCategory.update(
      { status: inactive },
      {
        where: { category_id: id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(req.user.user_id, 'delete', `Intento fallido de eliminar categoría de FAQ por ID: ${id}.`);
      return res.status(404).json({ message: 'Categoría de FAQ no encontrada.' });
    }

    // Obtener la categoría eliminada
    const deletedFaqCategory = await FaqCategory.findByPk(id);

    // Registrar la eliminación en el logger
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Categoría de FAQ eliminada: ${deletedFaqCategory.name}.`);

    res.status(200).json({ message: 'Categoría de FAQ eliminada exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la categoría de FAQ.', error: error.message });
  }
};
