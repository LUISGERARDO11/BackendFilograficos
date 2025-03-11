/* The above code is a set of functions written in JavaScript using Express.js for managing email
templates. Here is a summary of what each function does: */
const { body, validationResult } = require('express-validator');
const { EmailTemplate, EmailType } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

//Crea una nueva plantilla de email con su nombre, tipo de email, asunto, contenido (HTML y texto plano), y variables dinámicas.
exports.createEmailTemplate = [
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('email_type_id').isInt().withMessage('El tipo de email debe ser un ID válido.'),
  body('subject').isString().trim().notEmpty().withMessage('El asunto es obligatorio.'),
  body('html_content').isString().trim().notEmpty().withMessage('El contenido HTML es obligatorio.'),
  body('text_content').isString().trim().notEmpty().withMessage('El contenido en texto plano es obligatorio.'),
  body('variables').isArray().withMessage('Las variables deben ser un array.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, email_type_id, subject, html_content, text_content, variables } = req.body;

    try {
      // Verificar existencia del tipo de email
      const emailType = await EmailType.findByPk(email_type_id);
      if (!emailType) {
        return res.status(400).json({ message: 'El tipo de email especificado no existe.' });
      }

      // Verificar nombre único
      const existingTemplate = await EmailTemplate.findOne({ where: { name } });
      if (existingTemplate) {
        return res.status(400).json({ message: 'Ya existe una plantilla con ese nombre.' });
      }

      // Crear plantilla
      const newTemplate = await EmailTemplate.create({
        name,
        email_type_id,
        subject,
        html_content,
        text_content,
        variables, // Se almacena como JSON automáticamente
        created_by: req.user.user_id,
        active: true
      });

      loggerUtils.logUserActivity(req.user.user_id, 'create', `Plantilla creada: ${name}`);
      res.status(201).json({ message: 'Plantilla creada exitosamente.', template: newTemplate });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la plantilla', error: error.message });
    }
  }
];

// Obtener todas las plantillas activas
exports.getAllEmailTemplates = async (req, res) => {
  try {
    const templates = await EmailTemplate.findAll({
      where: { active: true },
      include: [{
        model: EmailType,
        attributes: ['name', 'token'],
        required: true
      }],
      attributes: { exclude: ['email_type_id', 'created_by', 'updated_by'] }
    });

    res.status(200).json(templates);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener plantillas', error: error.message });
  }
};
// Obtener todas las plantillas activas con paginación
exports.getEmailTemplates = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam, name, sortBy, sortOrder } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos'
      });
    }

    // Construir el objeto where dinámicamente
    const whereClause = { active: true }; // Solo plantillas activas por defecto

    // Filtro por nombre (búsqueda parcial con LIKE)
    if (name) {
      whereClause.name = { [Op.like]: `%${name}%` };
    }

    // Ordenamiento dinámico
    const validSortFields = ['name', 'subject', 'created_at']; // Campos válidos para ordenar
    const order = sortBy && validSortFields.includes(sortBy)
      ? [[sortBy, sortOrder === 'ASC' ? 'ASC' : 'DESC']]
      : [['created_at', 'DESC']]; // Por defecto, orden por created_at DESC

    // Consulta a la base de datos con paginación
    const { count, rows: templates } = await EmailTemplate.findAndCountAll({
      where: whereClause,
      include: [{
        model: EmailType,
        attributes: ['name', 'token'],
        required: true
      }],
      attributes: { exclude: ['email_type_id', 'created_by', 'updated_by'] },
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.status(200).json({
      templates,
      total: count,
      page,
      pageSize
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener plantillas', error: error.message });
  }
};

// Obtener plantilla por ID
exports.getEmailTemplateById = async (req, res) => {
  const { templateId } = req.params;

  try {
    const template = await EmailTemplate.findByPk(templateId, {
      include: [{
        model: EmailType,
        attributes: ['name', 'token'],
        required: true
      }]
    });

    if (!template || !template.active) {
      return res.status(404).json({ message: 'Plantilla no encontrada o desactivada' });
    }

    res.status(200).json(template);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener plantilla', error: error.message });
  }
};

// Actualizar plantilla
exports.updateEmailTemplate = [
  body('name').optional().isString().trim().notEmpty().withMessage('El nombre no puede estar vacío.'),
  body('email_type_id').optional().isInt().withMessage('El ID del tipo de email debe ser un número entero.'),
  body('subject').optional().isString().trim().notEmpty().withMessage('El asunto no puede estar vacío.'),
  body('html_content').optional().isString().trim().notEmpty().withMessage('El contenido HTML no puede estar vacío.'),
  body('text_content').optional().isString().trim().notEmpty().withMessage('El contenido de texto no puede estar vacío.'),
  body('variables').optional().isArray().withMessage('Las variables deben ser un arreglo.'),

  async (req, res) => {
    const { templateId } = req.params;
    const { name, email_type_id, subject, html_content, text_content, variables } = req.body;

    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template || !template.active) {
        return res.status(404).json({ message: 'Plantilla no encontrada' });
      }

      // Actualizar campos individualmente si existen en el body
      if (name !== undefined) template.name = name;
      if (email_type_id !== undefined) template.email_type_id = email_type_id;
      if (subject !== undefined) template.subject = subject;
      if (html_content !== undefined) template.html_content = html_content;
      if (text_content !== undefined) template.text_content = text_content;
      if (variables !== undefined) template.variables = variables;

      template.updated_by = req.user.user_id;

      await template.save();

      loggerUtils.logUserActivity(req.user.user_id, 'update', `Plantilla actualizada: ${template.name}`);
      res.status(200).json({ message: 'Plantilla actualizada', template });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la plantilla', error: error.message });
    }
  }
];

// Eliminación lógica
exports.deleteEmailTemplate = async (req, res) => {
  const { templateId } = req.params;

  try {
    const [affectedRows] = await EmailTemplate.update(
      { active: false, updated_by: req.user.user_id },
      { where: { template_id: templateId } }
    );

    if (affectedRows === 0) {
      return res.status(404).json({ message: 'Plantilla no encontrada' });
    }

    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Plantilla eliminada: ID ${templateId}`);
    res.status(200).json({ message: 'Plantilla desactivada exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar plantilla', error: error.message });
  }
};