const { body, param, validationResult } = require('express-validator');
const { SupportInquiry } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Middleware de validación
const validateConsultation = [
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('email').isEmail().withMessage('Debe ser un correo válido').normalizeEmail(),
  body('subject').trim().notEmpty().withMessage('El asunto es obligatorio').escape(),
  body('message').trim().notEmpty().withMessage('El mensaje es obligatorio').escape(),
];

// Crear una nueva consulta
exports.createConsultation = [
  validateConsultation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { name, email, subject, message } = req.body;
      const newConsultation = await SupportInquiry.create({
        name,
        email,
        subject,
        message,
        status: 'pending'
      });
      
      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'create', `Nueva consulta creada: ${newConsultation.id}`);
      res.status(201).json({ message: 'Consulta creada exitosamente.', consultation: newConsultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la consulta', error: error.message });
    }
  }
];

// Obtener todas las consultas ordenadas por fecha más reciente
exports.getAllConsultations = async (req, res) => {
  try {
    const consultations = await SupportInquiry.findAll({
      attributes: ['id', 'name', 'email', 'subject', 'status', 'createdAt', 'updatedAt'],
      order: [['createdAt', 'DESC']]
    });
    res.status(200).json({ consultations });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las consultas', error: error.message });
  }
};

// Obtener detalles de una consulta específica por ID
exports.getConsultationById = [
  param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const consultation = await SupportInquiry.findByPk(id);
      if (!consultation) {
        return res.status(404).json({ message: 'Consulta no encontrada' });
      }
      res.status(200).json({ consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener la consulta', error: error.message });
    }
  }
];

// Actualizar el estado de una consulta según su ID
exports.updateConsultationStatus = [
  param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
  body('status').trim().notEmpty().withMessage('El estado es obligatorio').escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const { status } = req.body;
      const consultation = await SupportInquiry.findByPk(id);
      if (!consultation) {
        return res.status(404).json({ message: 'Consulta no encontrada' });
      }
      await consultation.update({ status });
      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'update', `Estado de consulta ${id} actualizado a ${status}`);
      res.status(200).json({ message: 'Estado actualizado exitosamente.', consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el estado', error: error.message });
    }
  }
];

// Actualizar el canal de contacto según el ID de la consulta
exports.updateConsultationContactChannel = [
  param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
  body('contact_channel').trim().notEmpty().withMessage('El canal de contacto es obligatorio').escape(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    try {
      const { id } = req.params;
      const { contact_channel } = req.body;
      const consultation = await SupportInquiry.findByPk(id);
      if (!consultation) {
        return res.status(404).json({ message: 'Consulta no encontrada' });
      }
      await consultation.update({ contact_channel });
      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'update', `Canal de contacto de consulta ${id} actualizado a ${contact_channel}`);
      res.status(200).json({ message: 'Canal de contacto actualizado exitosamente.', consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el canal de contacto', error: error.message });
    }
  }
];

// Actualizar el canal de respuesta según el ID de la consulta
exports.updateConsultationResponseChannel = [
    param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
    body('response_channel').trim().notEmpty().withMessage('El canal de respuesta es obligatorio').escape(),
    async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }
      try {
        const { id } = req.params;
        const { response_channel } = req.body;
        const consultation = await SupportInquiry.findByPk(id);
        if (!consultation) {
          return res.status(404).json({ message: 'Consulta no encontrada' });
        }
        await consultation.update({ response_channel });
        loggerUtils.logUserActivity(req.user?.user_id || 'system', 'update', `Canal de contacto de consulta ${id} actualizado a ${response_channel}`);
        res.status(200).json({ message: 'Canal de contacto actualizado exitosamente.', consultation });
      } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al actualizar el canal de contacto', error: error.message });
      }
    }
  ];