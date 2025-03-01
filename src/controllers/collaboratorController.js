const { body, validationResult } = require('express-validator');
const Collaborator = require('../models/Collaborator');
const loggerUtils = require('../utils/loggerUtils'); // Asegúrate de que existe o lo creamos

// Crear un nuevo colaborador
exports.createCollaborator = [
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('collaborator_type').isIn(['individual', 'marca']).withMessage('Tipo inválido, debe ser "individual" o "marca".'),
  body('email').isEmail().withMessage('Debe ser un correo válido.'),
  body('phone').optional().isString().isLength({ min: 8, max: 15 }).withMessage('El teléfono debe tener entre 8 y 15 caracteres.'),
  body('contact').optional().isString().withMessage('El contacto debe ser un texto válido.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, collaborator_type,contact, email, phone, logo } = req.body;

      // Verificar si el correo ya existe
      const existingCollaborator = await Collaborator.findOne({ where: { email } });
      if (existingCollaborator) {
        return res.status(400).json({ message: 'El correo ya está registrado.' });
      }

      const newCollaborator = await Collaborator.create({
        name, collaborator_type, contact,email, phone, logo, active: true
      });

      loggerUtils.logUserActivity(req.user.user_id, 'create', `Colaborador creado: ${name}`);
      res.status(201).json({ message: 'Colaborador creado exitosamente.', collaborator: newCollaborator });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear colaborador', error: error.message });
    }
  }
];

// Obtener todos los colaboradores activos
exports.getAllCollaborators = async (req, res) => {
  try {
    const collaborators = await Collaborator.findAll({ where: { active: true } });
    res.status(200).json(collaborators);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener colaboradores', error: error.message });
  }
};

// Obtener un colaborador por ID
exports.getCollaboratorById = async (req, res) => {
  try {
    const collaborator = await Collaborator.findByPk(req.params.id);
    if (!collaborator || !collaborator.active) {
      return res.status(404).json({ message: 'Colaborador no encontrado' });
    }
    res.status(200).json(collaborator);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener colaborador', error: error.message });
  }
};

// Actualizar colaborador
exports.updateCollaborator = [
  body('email').optional().isEmail().withMessage('Debe ser un correo válido.'),
  body('phone').optional().isString().isLength({ min: 8, max: 15 }).withMessage('El teléfono debe tener entre 8 y 15 caracteres.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const collaborator = await Collaborator.findByPk(req.params.id);
      if (!collaborator || !collaborator.active) {
        return res.status(404).json({ message: 'Colaborador no encontrado' });
      }

      await collaborator.update(req.body);
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Colaborador actualizado: ${collaborator.name}`);
      res.status(200).json({ message: 'Colaborador actualizado.', collaborator });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar colaborador', error: error.message });
    }
  }
];

// Eliminación lógica de colaborador
exports.deleteCollaborator = async (req, res) => {
  try {
    const collaborator = await Collaborator.findByPk(req.params.id);
    if (!collaborator) {
      return res.status(404).json({ message: 'Colaborador no encontrado' });
    }

    await collaborator.update({ active: false });
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Colaborador desactivado: ${collaborator.name}`);
    res.status(200).json({ message: 'Colaborador desactivado correctamente.' });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar colaborador', error: error.message });
  }
};
