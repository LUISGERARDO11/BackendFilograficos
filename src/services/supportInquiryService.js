const { Op } = require("sequelize");
const SupportInquiry = require("../models/Supportinquiry");


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
  return await SupportInquiry.findAndCountAll({
    where: {
      created_at: {
        [Op.between]: [startDate, endDate],
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

  return await SupportInquiry.findAndCountAll({
    where: {
      updated_at: {
        [Op.between]: [startDate, endDate],
      },
    },
    limit: pageSize,
    offset: offset,
  });
};

/**
 * Combinar diferentes filtros en una sola consulta
 */
exports.getFilteredInquiries = async (filters, page = 1, pageSize = 10) => {
  const offset = (page - 1) * pageSize;

  // Construir el objeto de condiciones WHERE dinámicamente
  const whereClause = {};

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
    whereClause.created_at = {
      [Op.between]: [filters.startDate, filters.endDate],
    };
  }

  if (filters.user_id === "null") {
    whereClause.user_id = null; // Usuarios no registrados
  } else if (filters.user_id === "registered") {
    whereClause.user_id = { [Op.not]: null }; // Usuarios registrados
  }

  // Obtener las consultas filtradas y paginadas
  return await SupportInquiry.findAndCountAll({
    where: whereClause,
    limit: pageSize,
    offset: offset,
  });
};


//barra de busqueda
/**
 * Obtener todas las consultas realizadas por un usuario registrado
 */
exports.getInquiriesByUserId = async (userId) => {
  return await SupportInquiry.findAll({ where: { user_id: userId } });
};

/**
 * Obtener todas las consultas hechas desde un mismo correo electrónico
 */
exports.getInquiriesByEmail = async (email) => {
  return await SupportInquiry.findAll({ where: { user_email: email } });
};
