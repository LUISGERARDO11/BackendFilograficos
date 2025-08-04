const { body, validationResult } = require('express-validator');
const { User, ClientCluster } = require('../models/Associations');
const NotificationManager = require('../services/notificationManager');
const loggerUtils = require('../utils/loggerUtils');

const notificationManager = new NotificationManager();

exports.sendCouponToUsers = [
  // Validación de entrada
  body('user_ids')
    .optional()
    .isArray()
    .withMessage('user_ids debe ser un arreglo de enteros.')
    .custom((value) => {
      if (value && value.length > 0) {
        return value.every(id => Number.isInteger(id) && id > 0);
      }
      return true;
    })
    .withMessage('Cada user_id debe ser un entero positivo.'),
  body('cluster')
    .optional()
    .isInt({ min: 0, max: 2 })
    .withMessage('El cluster debe ser un entero entre 0 y 2.'),
  body().custom((value, { req }) => {
    if (!req.body.user_ids && req.body.cluster === undefined) {
      throw new Error('Debe proporcionar user_ids o cluster.');
    }
    if (req.body.user_ids && req.body.cluster !== undefined) {
      throw new Error('No puede proporcionar ambos: user_ids y cluster.');
    }
    return true;
  }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_ids, cluster } = req.body;
    const couponCode = 'DISCOUNT2025'; // Código de cupón hardcodeado para la prueba

    try {
      let users = [];

      // Seleccionar usuarios por user_ids
      if (user_ids && user_ids.length > 0) {
        users = await User.findAll({
          where: { user_id: user_ids, status: 'activo' },
          attributes: ['user_id', 'email', 'name'],
          raw: true
        });

        if (users.length !== user_ids.length) {
          loggerUtils.logUserActivity(req.user?.user_id, 'send_coupon', 'Algunos user_ids no encontrados o no activos');
        }
      }
      // Seleccionar usuarios por cluster
      else if (cluster !== undefined) {
        users = await User.findAll({
          include: [{
            model: ClientCluster,
            where: { cluster },
            attributes: []
          }],
          where: { status: 'activo' },
          attributes: ['user_id', 'email', 'name'],
          raw: true
        });

        if (users.length === 0) {
          return res.status(404).json({ message: `No se encontraron usuarios activos en el cluster ${cluster}.` });
        }
      }

      // Verificar límite de usuarios (10 a 500)
      if (users.length < 10 || users.length > 500) {
        return res.status(400).json({ message: 'El número de usuarios debe estar entre 10 y 500.' });
      }

      // Enviar correos con el cupón
      await notificationManager.notifyCouponDistribution(couponCode, users);

      loggerUtils.logUserActivity(req.user?.user_id, 'send_coupon', `Cupón ${couponCode} enviado a ${users.length} usuarios`);
      res.status(200).json({ message: `Cupón ${couponCode} enviado exitosamente a ${users.length} usuarios.` });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al enviar cupones', error: error.message });
    }
  }
];

module.exports = exports;