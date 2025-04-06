const { SupportInquiry, User } = require('../models/Associations');
const EmailService = require('../services/emailService');
const supportService = require('../services/supportInquiryService');
const loggerUtils = require('../utils/loggerUtils');
const verifyRecaptcha = require('../utils/googleUtils');
require('dotenv').config();

// Instanciamos el servicio de email
const emailService = new EmailService();

// Función auxiliar mejorada para enviar correos
const sendSupportEmail = async (user_email, user_name, subject, message, req) => {
  try {
    const emailResult = await emailService.sendUserSupportEmail(user_email, user_name, subject, message);
    if (!emailResult.success) {
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'support_email_failed',
        `Fallo al enviar correo de soporte desde ${user_email}`
      );
      return { success: false, error: emailResult.message || 'Error desconocido al enviar correo' };
    }
    return { success: true, messageId: emailResult.messageId };
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return { success: false, error: error.message };
  }
};

// Crear consulta con mejor manejo de errores y promesas
exports.createConsultation = async (req, res) => {
  const { user_name, user_email, subject, message, recaptchaToken } = req.body;

  try {
    // Validación inicial de datos
    if (!user_email || !user_name || !subject || !message || !recaptchaToken) {
      return res.status(400).json({ message: 'Faltan campos requeridos' });
    }

    // Verificación de reCAPTCHA
    const isRecaptchaValid = await verifyRecaptcha(recaptchaToken, res);
    if (!isRecaptchaValid) {
      return; // La función ya maneja la respuesta de error
    }

    // Enviar correo
    const emailResult = await sendSupportEmail(user_email, user_name, subject, message, req);
    if (!emailResult.success) {
      return res.status(500).json({
        message: 'Error al enviar el correo de soporte',
        error: emailResult.error
      });
    }

    // Buscar usuario existente
    const existingUser = await User.findOne({ where: { email: user_email } });
    const userId = existingUser?.user_id || null;

    // Crear consulta
    const newConsultation = await SupportInquiry.create({
      user_id: userId,
      user_name,
      user_email,
      subject,
      message,
      status: 'pending'
    });

    // Registro de actividad
    loggerUtils.logUserActivity(
      req.user?.user_id || 'system',
      'create',
      `Nueva consulta creada: ${newConsultation.inquiry_id}`
    );

    return res.status(201).json({
      message: 'Consulta creada exitosamente',
      consultation: newConsultation,
      emailInfo: { messageId: emailResult.messageId }
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ 
      message: 'Error al procesar la consulta', 
      error: error.message 
    });
  }
};

// Resto de las funciones permanecen similares pero con mejoras consistentes
exports.getConsultationCountsByStatus = async (req, res) => {
  try {
    const counts = await SupportInquiry.findAll({
      attributes: [
        'status',
        [SupportInquiry.sequelize.fn('COUNT', SupportInquiry.sequelize.col('status')), 'count'],
      ],
      group: ['status'],
    });

    return res.status(200).json({ consultationCounts: counts });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    return res.status(500).json({ 
      message: 'Error al obtener el número de consultas por estado', 
      error: error.message 
    });
  }
};

// Obtener todas las consultas ordenadas por fecha más reciente
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
exports.getConsultationById = async (req, res) => {
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
};

// Actualizar el estado de una consulta según su ID
exports.updateConsultationStatus = async (req, res) => {
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
};

// Actualizar el canal de contacto según el ID de la consulta
exports.updateConsultationContactChannel = async (req, res) => {
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
    res.status(500).json({ message: 'Error al actualizar el canal de contacto', error: error.message });
  }
};

// Actualizar el canal de respuesta según el ID de la consulta
exports.updateConsultationResponseChannel = async (req, res) => {
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
    res.status(500).json({ message: 'Error al actualizar el canal de respuesta', error: error.message });
  }
};

// Obtener consultas filtradas según los parámetros proporcionados
exports.getFilteredConsultations = async (req, res) => {
  try {
    const { status, contact_channel, response_channel, startDate, endDate, user_id, search, page: pageParam, pageSize: pageSizeParam } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos.',
      });
    }

    const applyFilters = async () => {
      const filtersProvided = {
        status: !!status,
        contact_channel: !!contact_channel,
        response_channel: !!response_channel,
        dateRange: !!startDate && !!endDate,
        user_id: user_id === 'null' || user_id === 'registered',
      };
      const filterCount = Object.values(filtersProvided).filter(Boolean).length;
      const hasSearch = !!search;

      // Define single-filter handlers
      const singleFilterHandlers = {
        status: () => supportService.getInquiriesByStatus(status, page, pageSize),
        contact_channel: () => supportService.getInquiriesByContactChannel(contact_channel, page, pageSize),
        response_channel: () => supportService.getInquiriesByResponseChannel(response_channel, page, pageSize),
        dateRange: () => supportService.getInquiriesByDateRange(startDate, endDate, page, pageSize),
        user_id: () => user_id === 'null'
          ? supportService.getInquiriesWithoutUser(page, pageSize)
          : supportService.getInquiriesWithUser(page, pageSize),
      };

      // Caso 1: Solo búsqueda (sin filtros)
      if (hasSearch && filterCount === 0) {
        return await supportService.searchInquiries(search, page, pageSize);
      }

      // Caso 2: Filtros (con o sin búsqueda)
      if (filterCount > 0) {
        const filters = { status, contact_channel, response_channel, startDate, endDate, user_id };
        return await supportService.getFilteredInquiries(filters, page, pageSize, hasSearch ? search : null);
      }

      // Caso 3: Solo un filtro (sin búsqueda)
      if (filterCount === 1) {
        // Find the active filter and call its handler
        const activeFilter = Object.keys(filtersProvided).find(key => filtersProvided[key]);
        return await singleFilterHandlers[activeFilter]();
      }

      // Caso por defecto: sin filtros ni búsqueda
      return await SupportInquiry.findAndCountAll({
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
    };

    const result = await applyFilters();
    res.status(200).json({ consultations: result.rows, total: result.count, page, pageSize });
  } catch (error) {
    // Manejo de errores
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las consultas filtradas.', error: error.message });
  }
};