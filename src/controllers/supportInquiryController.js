const { body, param, validationResult } = require('express-validator');
const { SupportInquiry, User  } = require('../models/Associations');
const emailService = require('../services/emailService');
const loggerUtils = require('../utils/loggerUtils');
const axios = require('axios');
require('dotenv').config();

// Middleware de validación
const validateConsultation = [
  body('user_name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('user_email').isEmail().withMessage('Debe ser un correo válido').normalizeEmail(),
  body('subject').trim().notEmpty().withMessage('El asunto es obligatorio').escape(),
  body('message').trim().notEmpty().withMessage('El mensaje es obligatorio').escape(),
  body('recaptchaToken').not().isEmpty().withMessage('Se requiere el token de reCAPTCHA'), // Validación del token de reCAPTCHA
];

// Crear una nueva consulta
exports.createConsultation = [
  validateConsultation,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_name, user_email, subject, message, recaptchaToken } = req.body;

    try {
      // 1. Verificar el token de reCAPTCHA con la API de Google
      const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
      const recaptchaResponse = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
        params: {
          secret: recaptchaSecretKey,
          response: recaptchaToken,
        },
      });

      const { success, score } = recaptchaResponse.data;
      if (!success || score < 0.5) {
        return res.status(400).json({ message: 'Fallo en la verificación de reCAPTCHA' });
      }

      // 2. Enviar el correo antes de guardar en la BD
      await emailService.sendUserSupportEmail(user_email, user_name, subject, message);

      // 3. Buscar el usuario en la base de datos por su email
      const existingUser = await User.findOne({ where: { email: user_email } });
      const userId = existingUser ? existingUser.user_id : null;

      // 4. Crear la consulta en SupportInquiry
      const newConsultation = await SupportInquiry.create({
        user_id: userId,
        user_name,
        user_email,
        subject,
        message,
        status: 'pending',
      });

      // 5. Registrar la actividad
      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'create', `Nueva consulta creada: ${newConsultation.inquiry_id}`);

      // 6. Respuesta exitosa
      res.status(201).json({ message: 'Consulta creada exitosamente.', consultation: newConsultation });
    } catch (error) {
      // 7. Manejo de errores
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al procesar la consulta', error: error.message });
    }
  },
];

// Obtener todas las consultas ordenadas por fecha más reciente
exports.getAllConsultations = async (req, res) => {
  try {
    const consultations = await SupportInquiry.findAll({
      attributes: ['id', 'user_name', 'user_email', 'subject', 'status', 'createdAt', 'updatedAt'],
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