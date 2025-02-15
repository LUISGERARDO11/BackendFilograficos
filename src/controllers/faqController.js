/* This JavaScript code defines a set of functions related to managing frequently asked questions
(FAQs) in an application. Here is a breakdown of what each function does: */
const { body, validationResult } = require('express-validator');
const { Faq, FaqCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Crear una nueva pregunta frecuente (FAQ)
exports.createFaq = [
  body('category_id').isInt().withMessage('La categoría debe ser un ID válido.'),
  body('question').isString().trim().notEmpty().withMessage('La pregunta es obligatoria.'),
  body('answer').isString().trim().notEmpty().withMessage('La respuesta es obligatoria.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { category_id, question, answer } = req.body;

    try {
      // Verificar si la categoría existe
      const category = await FaqCategory.findByPk(category_id);
      if (!category) {
        return res.status(400).json({ message: 'La categoría especificada no existe.' });
      }

      // Verificar si la pregunta ya existe en la misma categoría
      const existingFaq = await Faq.findOne({ where: { category_id, question } });
      if (existingFaq) {
        return res.status(400).json({ message: 'Ya existe una pregunta frecuente con ese contenido en esta categoría.' });
      }

      // Crear la nueva pregunta frecuente
      const newFaq = await Faq.create({
        category_id,
        question,
        answer,
        status: 'active'
      });

      loggerUtils.logUserActivity(req.user.user_id, 'create', `FAQ creada: ${question}`);
      res.status(201).json({ message: 'Pregunta frecuente creada exitosamente.', faq: newFaq });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la pregunta frecuente', error: error.message });
    }
  }
];

// Obtener todas las preguntas frecuentes activas
exports.getAllFaqs = async (req, res) => {
  try {
    const faqs = await Faq.findAll({
      where: { status: 'active' },
      include: [{
        model: FaqCategory,
        as: 'category',
        attributes: ['id', 'name', 'description']
      }]
    });

    // Agrupar preguntas por categoría
    const groupedFaqs = faqs.reduce((acc, faq) => {
      const { id, name, description } = faq.category || {};
      if (!id) return acc; // Si la categoría es nula o no tiene ID, ignorar
      
      if (!acc[id]) {
        acc[id] = {
          id,
          name,
          description,
          faqs: []
        };
      }
      
      acc[id].faqs.push({
        id: faq.id,
        question: faq.question,
        answer: faq.answer,
        createdAt: faq.createdAt,
        updatedAt: faq.updatedAt
      });
      return acc;
    }, {});

    res.status(200).json(Object.values(groupedFaqs));
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener preguntas frecuentes', error: error.message });
  }
};

// Obtener una pregunta frecuente por ID
exports.getFaqById = async (req, res) => {
  const { id } = req.params;

  try {
    const faq = await Faq.findByPk(id, {
      include: [{
        model: FaqCategory,
        as: 'category',
        attributes: ['name', 'description']
      }]
    });

    if (!faq || faq.status !== 'active') {
      return res.status(404).json({ message: 'Pregunta frecuente no encontrada o inactiva' });
    }

    res.status(200).json(faq);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la pregunta frecuente', error: error.message });
  }
};

// Actualizar una pregunta frecuente
exports.updateFaq = [
    body('category_id').optional().isInt().withMessage('El ID de la categoría debe ser un número entero.'),
    body('question').optional().isString().trim().notEmpty().withMessage('La pregunta no puede estar vacía.'),
    body('answer').optional().isString().trim().notEmpty().withMessage('La respuesta no puede estar vacía.'),
    body('status').optional().isIn(['active', 'inactive']).withMessage('El estado debe ser "active" o "inactive".'),
  
    async (req, res) => {
      const { id } = req.params;
      const { category_id, question, answer, status } = req.body;
  
      try {
        const faq = await Faq.findByPk(id);
        if (!faq) {
          return res.status(404).json({ message: 'Pregunta frecuente no encontrada' });
        }
  
        // Verificar si la categoría proporcionada existe
        if (category_id) {
          const category = await FaqCategory.findByPk(category_id);
          if (!category) {
            return res.status(400).json({ message: 'La categoría especificada no existe.' });
          }
        }
  
        // Actualizar campos individualmente si existen en el body
        if (category_id !== undefined) faq.category_id = category_id;
        if (question !== undefined) faq.question = question;
        if (answer !== undefined) faq.answer = answer;
        if (status !== undefined) faq.status = status;
  
        await faq.save();
  
        loggerUtils.logUserActivity(req.user.user_id, 'update', `FAQ actualizada: ${faq.question}`);
        res.status(200).json({ message: 'Pregunta frecuente actualizada', faq });
      } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al actualizar la pregunta frecuente', error: error.message });
      }
    }
];
  
// Eliminación lógica de una pregunta frecuente
exports.deleteFaq = async (req, res) => {
  const { id } = req.params;

  try {
    const [affectedRows] = await Faq.update(
      { status: 'inactive' },
      { where: { faq_id: id } }
    );

    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Pregunta frecuente no encontrada' });
    }

    loggerUtils.logUserActivity(req.user.user_id, 'delete', `FAQ eliminada: ID ${id}`);
    res.status(200).json({ message: 'Pregunta frecuente desactivada exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la pregunta frecuente', error: error.message });
  }
};