/* This JavaScript code defines a set of functions related to managing frequently asked questions
(FAQs) in an application. Here is a breakdown of what each function does: */
const { body, validationResult } = require('express-validator');
const { Faq, FaqCategory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

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
    const userId = req.user.user_id; // authMiddleware asegura que existe

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
        status: 'active',
      });

      loggerUtils.logUserActivity(userId, 'create', `FAQ creada: ${question}`);
      res.status(201).json({ message: 'Pregunta frecuente creada exitosamente.', faq: newFaq });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la pregunta frecuente', error: error.message });
    }
  },
];

// Obtener todas las preguntas frecuentes con paginación, búsqueda, filtro y agrupación
exports.getAllFaqs = async (req, res) => {
  try {
    const { page = 1, pageSize = 10, search = '', category_id, grouped = 'false' } = req.query;
    const user = req.user; // Puede ser undefined para no registrados
    const isAdmin = user && user.tipo === 'administrador';

    // Validar parámetros de paginación
    const pageNum = parseInt(page);
    const pageSizeNum = parseInt(pageSize);
    if (isNaN(pageNum) || isNaN(pageSizeNum) || pageNum < 1 || pageSizeNum < 1) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos.',
      });
    }

    // Construir condiciones de búsqueda
    const whereClause = { status: 'active' };
    if (search) {
      whereClause[Op.or] = [
        { question: { [Op.like]: `%${search}%` } },
        { answer: { [Op.like]: `%${search}%` } },
      ];
    }
    if (category_id) {
      whereClause.category_id = category_id;
    }

    // Definir atributos según el rol
    const attributes = isAdmin
      ? ['faq_id', 'category_id', 'question', 'answer', 'created_at', 'updated_at']
      : ['faq_id', 'category_id', 'question', 'answer'];

    // Consulta base
    const { count, rows } = await Faq.findAndCountAll({
      where: whereClause,
      attributes,
      include: [{
        model: FaqCategory,
        as: 'category',
        where: { status: 'active' },
        attributes: ['category_id', 'name', 'description'],
      }],
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
      order: [['created_at', 'DESC']], // Más reciente primero
    });

    // Agrupar por categoría si grouped es true
    if (grouped === 'true') {
      const groupedFaqs = rows.reduce((acc, faq) => {
        const { category_id, name, description } = faq.category;
        if (!acc[category_id]) {
          acc[category_id] = {
            id: category_id,
            name,
            description,
            faqs: [],
          };
        }
        acc[category_id].faqs.push({
          id: faq.faq_id,
          question: faq.question,
          answer: faq.answer,
          ...(isAdmin && { createdAt: faq.created_at, updatedAt: faq.updated_at }),
        });
        return acc;
      }, {});

      res.status(200).json({
        faqs: Object.values(groupedFaqs),
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    } else {
      const faqs = rows.map(faq => ({
        id: faq.faq_id,
        question: faq.question,
        answer: faq.answer,
        category: {
          id: faq.category.category_id,
          name: faq.category.name,
          description: faq.category.description,
        },
        ...(isAdmin && { createdAt: faq.created_at, updatedAt: faq.updated_at }),
      }));

      res.status(200).json({
        faqs,
        total: count,
        page: pageNum,
        pageSize: pageSizeNum,
      });
    }
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener preguntas frecuentes', error: error.message });
  }
};

// Obtener una pregunta frecuente por ID
exports.getFaqById = async (req, res) => {
  const { id } = req.params;
  const user = req.user; // Puede ser undefined para no registrados
  const isAdmin = user && user.tipo === 'administrador';

  try {
    const attributes = isAdmin
      ? ['faq_id', 'category_id', 'question', 'answer', 'created_at', 'updated_at']
      : ['faq_id', 'category_id', 'question', 'answer'];

    const faq = await Faq.findByPk(id, {
      attributes,
      include: [{
        model: FaqCategory,
        as: 'category',
        attributes: ['category_id', 'name', 'description'],
      }],
    });

    if (!faq || faq.status !== 'active') {
      return res.status(404).json({ message: 'Pregunta frecuente no encontrada o inactiva' });
    }

    const response = {
      id: faq.faq_id,
      question: faq.question,
      answer: faq.answer,
      category: {
        id: faq.category.category_id,
        name: faq.category.name,
        description: faq.category.description,
      },
      ...(isAdmin && { createdAt: faq.created_at, updatedAt: faq.updated_at }),
    };

    res.status(200).json(response);
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
    const userId = req.user.user_id; // authMiddleware asegura que existe

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const faq = await Faq.findByPk(id);
      if (!faq) {
        return res.status(404).json({ message: 'Pregunta frecuente no encontrada' });
      }

      if (category_id) {
        const category = await FaqCategory.findByPk(category_id);
        if (!category) {
          return res.status(400).json({ message: 'La categoría especificada no existe.' });
        }
        faq.category_id = category_id;
      }
      if (question !== undefined) faq.question = question;
      if (answer !== undefined) faq.answer = answer;
      if (status !== undefined) faq.status = status;

      await faq.save();

      loggerUtils.logUserActivity(userId, 'update', `FAQ actualizada: ${faq.question}`);
      res.status(200).json({ message: 'Pregunta frecuente actualizada', faq });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la pregunta frecuente', error: error.message });
    }
  },
];

// Eliminación lógica de una pregunta frecuente
exports.deleteFaq = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.user_id; // authMiddleware asegura que existe

  try {
    const [affectedRows] = await Faq.update(
      { status: 'inactive' },
      { where: { faq_id: id } }
    );

    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Pregunta frecuente no encontrada' });
    }

    loggerUtils.logUserActivity(userId, 'delete', `FAQ eliminada: ID ${id}`);
    res.status(200).json({ message: 'Pregunta frecuente desactivada exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la pregunta frecuente', error: error.message });
  }
};