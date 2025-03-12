const { body, validationResult } = require('express-validator');
const Collaborator = require('../models/Collaborator');
const loggerUtils = require('../utils/loggerUtils'); // Asegúrate de que existe o lo creamos
const cloudinaryService = require('../services/cloudinaryService'); // Añadimos el servicio de Cloudinary

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
      const { name, collaborator_type, contact, email, phone } = req.body;
      let logoUrl = null;

      // Subir el logo a Cloudinary si se envía una imagen
      if (req.file) {
        logoUrl = await cloudinaryService.uploadToCloudinary(req.file.buffer);
      }

      // Verificar si el correo ya existe
      const existingCollaborator = await Collaborator.findOne({ where: { email } });
      if (existingCollaborator) {
        return res.status(400).json({ message: 'El correo ya está registrado.' });
      }

      const newCollaborator = await Collaborator.create({
        name,
        collaborator_type,
        contact,
        email,
        phone,
        logo: logoUrl, // Guardamos la URL del logo (o null si no se subió)
        active: true
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

// Obtener todos los colaboradores activos con paginación
exports.getCollaborators = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos'
      });
    }

    // Consulta a la base de datos con paginación
    const { count, rows: collaborators } = await Collaborator.findAndCountAll({
      where: { active: true }, // Filtro fijo para colaboradores activos
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.status(200).json({
      collaborators,
      total: count,
      page,
      pageSize
    });
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

      // Subir nuevo logo a Cloudinary si se envía
      if (req.file) {
        const logoUrl = await cloudinaryService.uploadToCloudinary(req.file.buffer);
        req.body.logo = logoUrl;
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
