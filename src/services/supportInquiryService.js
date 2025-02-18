const { Op } = require("sequelize");
const SupportInquiry = require("../models/Supportinquiry");

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

/**
 * Filtrar consultas por estado
 */
exports.getInquiriesByStatus = async (status) => {
  return await SupportInquiry.findAll({ where: { status } });
};

/**
 * Obtener todas las consultas según el canal de contacto utilizado
 */
exports.getInquiriesByContactChannel = async (channel) => {
  return await SupportInquiry.findAll({ where: { contact_channel: channel } });
};

/**
 * Obtener consultas creadas en un rango de fechas
 */
exports.getInquiriesByDateRange = async (startDate, endDate) => {
  return await SupportInquiry.findAll({
    where: {
      created_at: { [Op.between]: [startDate, endDate] },
    },
  });
};

/**
 * Obtener consultas que fueron actualizadas recientemente
 */
exports.getInquiriesByUpdatedDate = async (startDate, endDate) => {
  return await SupportInquiry.findAll({
    where: {
      updated_at: { [Op.between]: [startDate, endDate] },
    },
  });
};

/**
 * Combinar diferentes filtros en una sola consulta
 */
exports.getFilteredInquiries = async (filters) => {
  const whereClause = {};

  if (filters.userId) whereClause.user_id = filters.userId;
  if (filters.email) whereClause.user_email = filters.email;
  if (filters.status) whereClause.status = filters.status;
  if (filters.contactChannel) whereClause.contact_channel = filters.contactChannel;
  if (filters.startDate && filters.endDate)
    whereClause.created_at = { [Op.between]: [filters.startDate, filters.endDate] };
  if (filters.updatedStartDate && filters.updatedEndDate)
    whereClause.updated_at = { [Op.between]: [filters.updatedStartDate, filters.updatedEndDate] };

  return await SupportInquiry.findAll({ where: whereClause });
};

/**
 * Ordenar consultas por fecha de creación (más recientes primero)
 */
exports.getSortedInquiries = async (order = "DESC") => {
  return await SupportInquiry.findAll({
    order: [["created_at", order]],
  });
};

/**
 * Obtener el número total de consultas por cada estado
 */
//va a ir el controller direcamente
exports.countInquiriesByStatus = async () => {
  return await SupportInquiry.findAll({
    attributes: ["status", [sequelize.fn("COUNT", sequelize.col("status")), "count"]],
    group: ["status"],
  });
};

/**
 * Obtener consultas donde user_id sea null (usuarios no registrados)
 */
exports.getInquiriesWithoutUser = async () => {
  return await SupportInquiry.findAll({ where: { user_id: null } });
};

/**
 * Obtener las últimas 5 consultas de un usuario en particular
 */
exports.getRecentInquiriesByUser = async (userId) => {
  return await SupportInquiry.findAll({
    where: { user_id: userId },
    order: [["created_at", "DESC"]],
    limit: 5,
  });
};
