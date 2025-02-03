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
  body('name').optional().isString().trim().notEmpty(),
  body('email_type_id').optional().isInt(),
  body('subject').optional().isString().trim().notEmpty(),
  body('html_content').optional().isString().trim().notEmpty(),
  body('text_content').optional().isString().trim().notEmpty(),
  body('variables').optional().isArray(),

  async (req, res) => {
    const { templateId } = req.params;
    const updates = req.body;

    try {
      const template = await EmailTemplate.findByPk(templateId);
      if (!template || !template.active) {
        return res.status(404).json({ message: 'Plantilla no encontrada' });
      }

      // Actualizar campos
      const updatedTemplate = await template.update({
        ...updates,
        updated_by: req.user.user_id
      });

      loggerUtils.logUserActivity(req.user.user_id, 'update', `Plantilla actualizada: ${updatedTemplate.name}`);
      res.status(200).json({ message: 'Plantilla actualizada', template: updatedTemplate });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar plantilla', error: error.message });
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