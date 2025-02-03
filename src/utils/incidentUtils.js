const { Op } = require('sequelize');
const FailedAttempt = require("../models/Failedattempts");
const User = require("../models/Users");

exports.getFailedAttemptsData = async (periodo) => {
  try{
    let fechaInicio = new Date();

    switch (periodo) {
        case 'dia':
        fechaInicio.setDate(fechaInicio.getDate() - 1);
        break;
        case 'semana':
        fechaInicio.setDate(fechaInicio.getDate() - 7);
        break;
        case 'mes':
        fechaInicio.setMonth(fechaInicio.getMonth() - 1);
        break;
        default:
        throw new Error('Periodo no válido. Use "dia", "semana" o "mes".');
    }

    const result = await FailedAttempt.findAll({
        where: {
        attempt_date: {
            [Op.gte]: fechaInicio
        }
        },
        include: [{
        model: User,
        attributes: ['name', 'email', 'status', 'user_type'],
        required: true
        }],
        attributes: [
        [FailedAttempt.sequelize.fn('SUM', FailedAttempt.sequelize.col('attempts')), 'total_attempts'],
        [FailedAttempt.sequelize.fn('MAX', FailedAttempt.sequelize.col('attempt_date')), 'last_attempt_date'],
        [FailedAttempt.sequelize.fn('MAX', FailedAttempt.sequelize.col('is_resolved')), 'is_resolved']
        ],
        group: ['FailedAttempt.user_id', 'User.user_id'],
        order: [[FailedAttempt.sequelize.literal('total_attempts'), 'DESC']],
        raw: true
    });

    // Procesar los resultados
    const processed = result.map(item => ({
        user_id: item['User.user_id'],
        nombre: item['User.name'],
        email: item['User.email'],
        estado: item['User.status'],
        tipo_usuario: item['User.user_type'],
        numero_intentos: item.total_attempts,
        is_resolved: item.is_resolved,
        fecha: item.last_attempt_date
    }));

    const clientes = processed.filter(user => user.tipo_usuario === 'cliente');
    const administradores = processed.filter(user => user.tipo_usuario === 'administrador');

    return { clientes, administradores };
  }catch (error){
    console.error('Error en getFailedAttemptsData:', error);
    throw new Error('Error al obtener intentos fallidos');
  }
};