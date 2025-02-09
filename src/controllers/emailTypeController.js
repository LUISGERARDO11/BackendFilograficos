/* The above code is a Node.js module that defines several controller functions for managing email
types in an application. Here is a summary of what each function does: */
const { body, validationResult } = require('express-validator');
const EmailType = require('../models/Emailtypes');
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');

// Crear tipo de email
exports.createEmailType = [
    // Validaciones de entrada
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
  
      // Verificar que req.user.user_id tiene el ID del usuario
      if (!req.user || !req.user.user_id) {
        return res.status(401).json({ message: 'Usuario no autenticado.' });
      }
  
      try {
        // Verificar si el token ya existe
        const existingType = await EmailType.findOne({ where: { token } });
        if (existingType) {
          loggerUtils.logUserActivity(req.user.user_id, 'create', 'Intento de crear un tipo de email con token duplicado.');
          return res.status(400).json({ message: 'El token del tipo de email ya existe.' });
        }
  
        // Crear un nuevo tipo de email
        const newEmailType = await EmailType.create({
          token,
          name,
          description,
          required_variables: required_variables, // Se guarda como JSON
          created_by: req.user.user_id // El ID del usuario autenticado que lo creó
        });
  
        // Registrar la creación en el logger
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
        loggerUtils.logUserActivity(req.user.user_id, 'view', `Intento fallido de obtener tipo de email por ID: ${id}.`);
        return res.status(404).json({ message: 'Tipo de email no encontrado.' });
      }
  
      // Registrar el acceso a la información
      loggerUtils.logUserActivity(req.user.user_id, 'view', `Obtenido tipo de email: ${emailType.name}.`);
  
      res.status(200).json({ emailType });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener el tipo de email.', error: error.message });
    }
};

// Obtener todos los tipos activos
exports.getAllEmailTypes = async (req, res) => {
    try {
      const emailTypes = await EmailType.findAll({
        where: { active: true } // Solo tipos de email activos
      });
  
      // Registrar el acceso a la información
      loggerUtils.logUserActivity(req.user.user_id, 'view', 'Obtenidos todos los tipos de email activos.');
  
      res.status(200).json({ emailTypes });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener los tipos de email.', error: error.message });
    }
};

// Actualizar tipo de email
exports.updateEmailType = async (req, res) => {
    const { id } = req.params;
    const { token, name, description, required_variables } = req.body;
  
    try {
      // Buscar y actualizar el tipo de email
      const [updatedRows] = await EmailType.update(
        {
          token,
          name,
          description,
          required_variables: required_variables, // Se guarda como JSON
          updated_by: req.user.user_id
        },
        {
          where: { email_type_id: id },
          returning: true // Devuelve el documento actualizado
        }
      );
  
      if (updatedRows === 0) {
        loggerUtils.logUserActivity(req.user.user_id, 'update', `Intento fallido de actualizar tipo de email por ID: ${id}.`);
        return res.status(404).json({ message: 'Tipo de email no encontrado.' });
      }
  
      // Obtener el tipo de email actualizado
      const updatedEmailType = await EmailType.findByPk(id);
  
      // Registrar la actualización en el logger
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Tipo de email actualizado: ${token} - ${name}.`);
  
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
      // Buscar y marcar como inactivo (eliminación lógica)
      const [updatedRows] = await EmailType.update(
        { active: false },
        {
          where: { email_type_id: id },
          returning: true // Devuelve el documento actualizado
        }
      );
  
      if (updatedRows === 0) {
        loggerUtils.logUserActivity(req.user.user_id, 'delete', `Intento fallido de eliminar tipo de email por ID: ${id}.`);
        return res.status(404).json({ message: 'Tipo de email no encontrado.' });
      }
  
      // Obtener el tipo de email eliminado
      const deletedEmailType = await EmailType.findByPk(id);
  
      // Registrar la eliminación en el logger
      loggerUtils.logUserActivity(req.user.user_id, 'delete', `Tipo de email eliminado: ${deletedEmailType.token} - ${deletedEmailType.name}.`);
  
      res.status(200).json({ message: 'Tipo de email eliminado exitosamente.' });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al eliminar el tipo de email.', error: error.message });
    }
};