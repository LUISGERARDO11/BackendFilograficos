const { body, param, validationResult } = require('express-validator');
const { SupportInquiry, User } = require('../models/Associations');
const EmailService = require('../services/emailService'); // Importamos la clase directamente
const supportService = require('../services/supportInquiryService');
const loggerUtils = require('../utils/loggerUtils');
const axios = require('axios');
require('dotenv').config();

// Instanciamos el servicio de email
const emailService = new EmailService();

// Middleware de validación
const validateConsultation = [
  body('user_name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('user_email').isEmail().withMessage('Debe ser un correo válido').normalizeEmail(),
  body('subject').trim().notEmpty().withMessage('El asunto es obligatorio').escape(),
  body('message').trim().notEmpty().withMessage('El mensaje es obligatorio').escape(),
  body('recaptchaToken').not().isEmpty().withMessage('Se requiere el token de reCAPTCHA'),
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
      const recaptchaResponse = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify`,
        null,
        {
          params: {
            secret: recaptchaSecretKey,
            response: recaptchaToken,
          },
        }
      );

      const { success, score } = recaptchaResponse.data;
      if (!success || score < 0.5) {
        return res.status(400).json({ message: 'Fallo en la verificación de reCAPTCHA' });
      }

      // 2. Enviar el correo antes de guardar en la BD
      const emailResult = await emailService.sendUserSupportEmail(
        user_email,
        user_name,
        subject,
        message
      );

      if (!emailResult.success) {
        loggerUtils.logUserActivity(
          req.user?.user_id || 'system',
          'support_email_failed',
          `Fallo al enviar correo de soporte desde ${user_email}`
        );
        return res.status(500).json({
          message: 'Error al enviar el correo de soporte.',
          error: emailResult.message || 'No se recibió información del error',
        });
      }

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
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'create',
        `Nueva consulta creada: ${newConsultation.inquiry_id}`
      );

      // 6. Respuesta exitosa con información del correo
      res.status(201).json({
        message: 'Consulta creada exitosamente.',
        consultation: newConsultation,
        emailInfo: { messageId: emailResult.messageId },
      });
    } catch (error) {
      // 7. Manejo de errores
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al procesar la consulta', error: error.message });
    }
  },
];

// Obtener el número total de consultas por cada estado
exports.getConsultationCountsByStatus = async (req, res) => {
  try {
    const counts = await SupportInquiry.findAll({
      attributes: [
        'status',
        [SupportInquiry.sequelize.fn('COUNT', SupportInquiry.sequelize.col('status')), 'count'],
      ],
      group: ['status'],
    });

    res.status(200).json({ consultationCounts: counts });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      message: 'Error al obtener el número de consultas por estado',
      error: error.message,
    });
  }
};

// Obtener todas las consultas ordenadas por fecha más reciente (con o sin paginación)
exports.getAllConsultations = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos',
      });
    }

    const { count, rows: consultations } = await SupportInquiry.findAndCountAll({
      attributes: [
        'inquiry_id',
        'user_id',
        'user_name',
        'user_email',
        'subject',
        'status',
        'response_channel',
        'created_at',
        'updated_at',
      ],
      order: [['created_at', 'DESC']],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });

    res.status(200).json({
      consultations,
      total: count,
      page,
      pageSize,
    });
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
  },
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
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'update',
        `Estado de consulta ${id} actualizado a ${status}`
      );
      res.status(200).json({ message: 'Estado actualizado exitosamente.', consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el estado', error: error.message });
    }
  },
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
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'update',
        `Canal de contacto de consulta ${id} actualizado a ${contact_channel}`
      );
      res.status(200).json({ message: 'Canal de contacto actualizado exitosamente.', consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        message: 'Error al actualizar el canal de contacto',
        error: error.message,
      });
    }
  },
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
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'update',
        `Canal de respuesta de consulta ${id} actualizado a ${response_channel}`
      );
      res.status(200).json({ message: 'Canal de respuesta actualizado exitosamente.', consultation });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        message: 'Error al actualizar el canal de respuesta',
        error: error.message,
      });
    }
  },
];

// Obtener consultas filtradas según los parámetros proporcionados
exports.getFilteredConsultations = async (req, res) => {
  try {
    console.log('Query Params:', req.query);

    const {
      status,
      contact_channel,
      response_channel,
      startDate,
      endDate,
      user_id,
      page: pageParam,
      pageSize: pageSizeParam,
    } = req.query;

    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos.',
      });
    }

    // Determinar qué filtros se han proporcionado
    const filtersProvided = {
      status: !!status,
      contact_channel: !!contact_channel,
      response_channel: !!response_channel,
      dateRange: !!startDate && !!endDate,
      user_id: user_id === 'null' || user_id === 'registered',
    };

    // Contar cuántos filtros se han proporcionado
    const filterCount = Object.values(filtersProvided).filter(Boolean).length;

    let result;

    // Si solo se proporciona un filtro, usar el método específico del servicio
    if (filterCount === 1) {
      if (filtersProvided.status) {
        result = await supportService.getInquiriesByStatus(status, page, pageSize);
      } else if (filtersProvided.contact_channel) {
        result = await supportService.getInquiriesByContactChannel(contact_channel, page, pageSize);
      } else if (filtersProvided.response_channel) {
        result = await supportService.getInquiriesByResponseChannel(response_channel, page, pageSize);
      } else if (filtersProvided.dateRange) {
        result = await supportService.getInquiriesByDateRange(startDate, endDate, page, pageSize);
      } else if (filtersProvided.user_id) {
        if (user_id === 'null') {
          result = await supportService.getInquiriesWithoutUser(page, pageSize);
        } else if (user_id === 'registered') {
          result = await supportService.getInquiriesWithUser(page, pageSize);
        }
      }
    } else if (filterCount > 1) {
      // Si se proporcionan múltiples filtros, usar el método combinado
      const filters = {
        status,
        contact_channel,
        response_channel,
        startDate,
        endDate,
        user_id,
      };
      result = await supportService.getFilteredInquiries(filters, page, pageSize);
    } else {
      // Si no se proporcionan filtros, devolver todas las consultas paginadas
      result = await SupportInquiry.findAndCountAll({
        attributes: [
          'inquiry_id',
          'user_id',
          'user_name',
          'user_email',
          'subject',
          'status',
          'response_channel',
          'created_at',
          'updated_at',
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
    }

    // Respuesta exitosa
    res.status(200).json({
      consultations: result.rows,
      total: result.count,
      page,
      pageSize,
    });
  } catch (error) {
    // Manejo de errores
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      message: 'Error al obtener las consultas filtradas.',
      error: error.message,
    });
  }
};