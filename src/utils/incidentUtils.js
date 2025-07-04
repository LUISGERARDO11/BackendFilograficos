/* This JavaScript code defines an asynchronous function `getFailedAttemptsData` that retrieves data
about failed login attempts based on a specified period (day, week, or month). Here is a breakdown
of what the code does: */
const { Op } = require('sequelize');
const { User, FailedAttempt } = require('../models/Associations');
const moment = require('moment-timezone');

// Función para obtener datos de intentos fallidos en un periodo determinado
exports.getFailedAttemptsData = async (periodo) => {
  try {
    // Usar UTC para cálculos de períodos
    let fechaInicio = moment().tz('UTC'); // Fecha actual en UTC

    // Determinar la fecha de inicio basada en el periodo solicitado
    switch (periodo) {
      case 'dia':
        fechaInicio = fechaInicio.subtract(1, 'days'); // Restar 1 día
        break;
      case 'semana':
        fechaInicio = fechaInicio.subtract(7, 'days'); // Restar 7 días
        break;
      case 'mes':
        fechaInicio = fechaInicio.subtract(1, 'months'); // Restar 1 mes
        break;
      default:
        throw new Error('Periodo no válido. Use "dia", "semana" o "mes".');
    }

    // Consultamos los intentos fallidos desde la fecha de inicio hasta la actualidad
    const result = await FailedAttempt.findAll({
      where: {
        attempt_date: {
          [Op.gte]: fechaInicio.toDate() // Filtrar en UTC
        }
      },
      include: [{
        model: User, // Relacionamos cada intento con su usuario correspondiente
        attributes: ['user_id','name', 'email', 'status', 'user_type'], // Seleccionamos solo estos campos del usuario
        required: true // Se excluyen registros sin usuario asociado
      }],
      attributes: [
        // Sumamos el total de intentos fallidos por usuario
        [FailedAttempt.sequelize.fn('SUM', FailedAttempt.sequelize.col('attempts')), 'total_attempts'],
        // Obtenemos la última fecha en la que ocurrió un intento fallido
        [FailedAttempt.sequelize.fn('MAX', FailedAttempt.sequelize.col('attempt_date')), 'last_attempt_date'],
        // Verificamos si el problema de intentos fallidos fue resuelto
        [FailedAttempt.sequelize.fn('MAX', FailedAttempt.sequelize.col('is_resolved')), 'is_resolved']
      ],
      group: ['FailedAttempt.user_id', 'User.user_id'], // Agrupamos por usuario
      order: [[FailedAttempt.sequelize.literal('total_attempts'), 'DESC']], // Ordenamos por número de intentos fallidos en orden descendente
      raw: true // Devuelve los resultados como objetos JSON planos
    });

    // Procesamos los resultados para estructurarlos en un formato más amigable
    const processed = result.map(item => ({
      user_id: item['User.user_id'] || item.user_id,
      nombre: item['User.name'],
      email: item['User.email'],
      estado: item['User.status'],
      tipo_usuario: item['User.user_type'],
      numero_intentos: item.total_attempts,
      is_resolved: item.is_resolved,
      fecha: moment(item.last_attempt_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss') // Presentar en America/Mexico_City
    }));

    // Filtramos los usuarios según su tipo
    const clientes = processed.filter(user => user.tipo_usuario === 'cliente');
    const administradores = processed.filter(user => user.tipo_usuario === 'administrador');

    // Retornamos los datos de intentos fallidos organizados por tipo de usuario
    return { clientes, administradores };

  } catch (error) {
    console.error('Error en getFailedAttemptsData:', error);
    throw new Error('Error al obtener intentos fallidos');
  }
};