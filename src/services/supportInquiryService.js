/* This JavaScript code snippet is a module that provides various functions to query and filter support inquiries stored in a database using Sequelize, which is an ORM for Node.js. */
const { Op } = require("sequelize");
const SupportInquiry = require("../models/Supportinquiry");
const moment = require('moment-timezone');

//filtros 
/**
 * Filtrar consultas por estado
 */
exports.getInquiriesByStatus = async (status, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  return await SupportInquiry.findAndCountAll({
    where: { status },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener todas las consultas según el canal de contacto utilizado
 */
exports.getInquiriesByContactChannel = async (channel, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  return await SupportInquiry.findAndCountAll({
    where: { contact_channel: channel },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener todas las consultas según el canal de respuesta utilizado
 */
exports.getInquiriesByResponseChannel = async (channel, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  return await SupportInquiry.findAndCountAll({
    where: { response_channel: channel },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener consultas creadas en un rango de fechas
 */
exports.getInquiriesByDateRange = async (startDate, endDate, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  const startDateUTC = moment.tz(startDate, 'America/Mexico_City').tz('UTC').toDate();
  const endDateUTC = moment.tz(endDate, 'America/Mexico_City').tz('UTC').toDate();
  return await SupportInquiry.findAndCountAll({
    where: {
      created_at: {
        [Op.between]: [startDateUTC, endDateUTC],
      },
    },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener consultas donde user_id sea null (usuarios no registrados)
 */
exports.getInquiriesWithoutUser = async (page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  return await SupportInquiry.findAndCountAll({
    where: { user_id: null },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener consultas donde user_id no sea null (usuarios registrados)
 */
exports.getInquiriesWithUser = async (page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  return await SupportInquiry.findAndCountAll({
    where: { user_id: { [Op.not]: null } }, // Filtra usuarios registrados
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Obtener consultas que fueron actualizadas recientemente
 */
exports.getInquiriesByUpdatedDate = async (startDate, endDate, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  const startDateUTC = moment.tz(startDate, 'America/Mexico_City').tz('UTC').toDate();
  const endDateUTC = moment.tz(endDate, 'America/Mexico_City').tz('UTC').toDate();
  return await SupportInquiry.findAndCountAll({
    where: {
      updated_at: {
        [Op.between]: [startDateUTC, endDateUTC],
      },
    },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Buscar consultas por ID, nombre, correo o asunto
 */
exports.searchInquiries = async (searchTerm, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;
  const searchPattern = `%${searchTerm}%`;

  return await SupportInquiry.findAndCountAll({
    where: {
      [Op.or]: [
        { inquiry_id: searchTerm },
        { user_name: { [Op.like]: searchPattern } },
        { user_email: { [Op.like]: searchPattern } },
        { subject: { [Op.like]: searchPattern } },
      ],
    },
    limit: pageSize,
    offset: offset,
    order: [['created_at', 'DESC']],
  });
};

/**
 * Combinar diferentes filtros en una sola consulta (con opción de búsqueda)
 */
exports.getFilteredInquiries = async (filters, page = 1, pageSize = 10, searchTerm = null) => {
  const offset = (page - 1) * pageSize;
  const whereClause = {};

  // Aplicar filtros existentes
  if (filters.status) {
    whereClause.status = filters.status;
  }

  if (filters.contact_channel) {
    whereClause.contact_channel = filters.contact_channel;
  }

  if (filters.response_channel) {
    whereClause.response_channel = filters.response_channel;
  }

  if (filters.startDate && filters.endDate) {
    const startDateUTC = moment.tz(filters.startDate, 'America/Mexico_City').tz('UTC').toDate();
    const endDateUTC = moment.tz(filters.endDate, 'America/Mexico_City').tz('UTC').toDate();
    whereClause.created_at = {
      [Op.between]: [startDateUTC, endDateUTC],
    };
  }

  if (filters.user_id === "null") {
    whereClause.user_id = null;
  } else if (filters.user_id === "registered") {
    whereClause.user_id = { [Op.not]: null };
  }

  // Añadir búsqueda si está presente
  if (searchTerm) {
    const searchPattern = `%${searchTerm}%`;
    whereClause[Op.or] = [
      { inquiry_id: searchTerm },
      { user_name: { [Op.like]: searchPattern } },
      { user_email: { [Op.like]: searchPattern } },
      { subject: { [Op.like]: searchPattern } },
    ];
  }

  return await SupportInquiry.findAndCountAll({
    where: whereClause,
    limit: pageSize,
    offset: offset,
    order: [['created_at', 'DESC']],
  });
};