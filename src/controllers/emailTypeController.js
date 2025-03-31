/* The above code is a Node.js module that defines several controller functions for managing email
types in an application. Here is a summary of what each function does: */
const { body, validationResult } = require('express-validator');
const EmailType = require('../models/Emailtypes');
const loggerUtils = require('../utils/loggerUtils');

// Crear tipo de email
exports.createEmailType = [
  body('token').isString().trim().notEmpty().withMessage('El token es obligatorio.'),
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('required_variables').isArray().withMessage('Las variables requeridas deben ser un array.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      loggerUtils.logCriticalError(new Error('Errores de validación al crear el tipo de email.'));
      return res.status(400).json({ errors: errors.array() });
    }

    const { token, name, description, required_variables } = req.body;

    // Verificar que req.user?.user_id existe usando encadenamiento opcional
    if (!req.user?.user_id) {
      return res.status(401).json({ message: 'Usuario no autenticado.' });
    }

    try {
      const existingType = await EmailType.findOne({ where: { token } });
      if (existingType) {
        loggerUtils.logUserActivity(req.user.user_id, 'create', 'Intento de crear un tipo de email con token duplicado.');
        return res.status(400).json({ message: 'El token del tipo de email ya existe.' });
      }

      const newEmailType = await EmailType.create({
        token,
        name,
        description,
        required_variables,
        created_by: req.user.user_id
      });

      loggerUtils.logUserActivity(req.user.user_id, 'create', `Tipo de email creado: ${token} - ${name}.`);
      res.status(201).json({ message: 'Tipo de email creado exitosamente.', emailType: newEmailType });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear el tipo de email.', error: error.message });
    }
  }
];

// Obtener tipo por ID
exports.getEmailTypeById = async (req, res) => {
  const { id } = req.params;

  try {
    const emailType = await EmailType.findByPk(id);
    if (!emailType) {
      loggerUtils.logUserActivity(req.user?.user_id, 'view', `Intento fallido de obtener tipo de email por ID: ${id}.`);
      return res.status(404).json({ message: 'Tipo de email no encontrado.' });
    }

    loggerUtils.logUserActivity(req.user?.user_id, 'view', `Obtenido tipo de email: ${emailType.name}.`);
    res.status(200).json({ emailType });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el tipo de email.', error: error.message });
  }
};

// Obtener todos los tipos activos
exports.getAllEmailTypes = async (req, res) => {
  try {
    const emailTypes = await EmailType.findAll({ where: { active: true } });
    loggerUtils.logUserActivity(req.user?.user_id, 'view', 'Obtenidos todos los tipos de email activos.');
    res.status(200).json({ emailTypes });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener los tipos de email.', error: error.message });
  }
};

// Obtener todos los tipos activos con paginación
exports.getEmailTypes = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos'
      });
    }

    const { count, rows: emailTypes } = await EmailType.findAndCountAll({
      where: { active: true },
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    loggerUtils.logUserActivity(req.user?.user_id, 'view', 'Obtenidos todos los tipos de email activos con paginación.');
    res.status(200).json({ emailTypes, total: count, page, pageSize });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener los tipos de email', error: error.message });
  }
};

// Actualizar tipo de email
exports.updateEmailType = async (req, res) => {
  const { id } = req.params;
  const { token, name, description, required_variables } = req.body;

  try {
    const [updatedRows] = await EmailType.update(
      {
        token,
        name,
        description,
        required_variables,
        updated_by: req.user?.user_id
      },
      {
        where: { email_type_id: id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(req.user?.user_id, 'update', `Intento fallido de actualizar tipo de email por ID: ${id}.`);
      return res.status(404).json({ message: 'Tipo de email no encontrado.' });
    }

    const updatedEmailType = await EmailType.findByPk(id);
    loggerUtils.logUserActivity(req.user?.user_id, 'update', `Tipo de email actualizado: ${token} - ${name}.`);
    res.status(200).json({ message: 'Tipo de email actualizado exitosamente.', emailType: updatedEmailType });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar el tipo de email.', error: error.message });
  }
};

// Eliminación lógica
exports.deleteEmailType = async (req, res) => {
  const { id } = req.params;

  try {
    const [updatedRows] = await EmailType.update(
      { active: false },
      {
        where: { email_type_id: id },
        returning: true
      }
    );

    if (updatedRows === 0) {
      loggerUtils.logUserActivity(req.user?.user_id, 'delete', `Intento fallido de eliminar tipo de email por ID: ${id}.`);
      return res.status(404).json({ message: 'Tipo de email no encontrado.' });
    }

    const deletedEmailType = await EmailType.findByPk(id);
    loggerUtils.logUserActivity(req.user?.user_id, 'delete', `Tipo de email eliminado: ${deletedEmailType.token} - ${deletedEmailType.name}.`);
    res.status(200).json({ message: 'Tipo de email eliminado exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar el tipo de email.', error: error.message });
  }
};