/* This JavaScript code defines an asynchronous function `getFailedAttemptsData` that retrieves data
about failed login attempts based on a specified period (day, week, or month). Here is a breakdown
of what the code does: */
const { Op } = require('sequelize');
const { User, FailedAttempt } = require('../models/Associations')

// Función para obtener datos de intentos fallidos en un periodo determinado
exports.getFailedAttemptsData = async (periodo) => {
  try {
    let fechaInicio = new Date(); // Obtenemos la fecha y hora actual

    // Determinar la fecha de inicio basada en el periodo solicitado
    switch (periodo) {
      case 'dia':
        fechaInicio.setDate(fechaInicio.getDate() - 1); // Restar 1 día a la fecha actual
        break;
      case 'semana':
        fechaInicio.setDate(fechaInicio.getDate() - 7); // Restar 7 días a la fecha actual
        break;
      case 'mes':
        fechaInicio.setMonth(fechaInicio.getMonth() - 1); // Restar 1 mes a la fecha actual
        break;
      default:
        throw new Error('Periodo no válido. Use "dia", "semana" o "mes".'); // Si el periodo no es válido, lanzamos un error
    }

    // Consultamos los intentos fallidos desde la fecha de inicio hasta la actualidad
    const result = await FailedAttempt.findAll({
      where: {
        attempt_date: {
          [Op.gte]: fechaInicio // Filtrar intentos fallidos que ocurran después de la fecha de inicio
        }
      },
      include: [{
        model: User, // Relacionamos cada intento con su usuario correspondiente
        attributes: ['name', 'email', 'status', 'user_type'], // Seleccionamos solo estos campos del usuario
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
      user_id: item['User.user_id'], // ID del usuario
      nombre: item['User.name'], // Nombre del usuario
      email: item['User.email'], // Correo electrónico del usuario
      estado: item['User.status'], // Estado del usuario (activo, inactivo, etc.)
      tipo_usuario: item['User.user_type'], // Tipo de usuario (cliente, administrador, etc.)
      numero_intentos: item.total_attempts, // Número total de intentos fallidos
      is_resolved: item.is_resolved, // Si el problema fue resuelto
      fecha: item.last_attempt_date // Última fecha en la que se registró un intento fallido
    }));

    // Filtramos los usuarios según su tipo
    const clientes = processed.filter(user => user.tipo_usuario === 'cliente'); // Usuarios tipo "cliente"
    const administradores = processed.filter(user => user.tipo_usuario === 'administrador'); // Usuarios tipo "administrador"

    // Retornamos los datos de intentos fallidos organizados por tipo de usuario
    return { clientes, administradores };

  } catch (error) {
    console.error('Error en getFailedAttemptsData:', error); // Mostramos el error en la consola para depuración
    throw new Error('Error al obtener intentos fallidos'); // Lanzamos un error genérico para evitar exponer detalles sensibles
  }
};