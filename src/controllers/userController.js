/* The above code is a set of functions related to user profile management, account deletion, and user
administration in a Node.js application using Express and Sequelize ORM. Here is a summary of the
functionalities: */
const { body, validationResult } = require('express-validator');
const { User, Address } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');
const userServices = require('../services/userServices');
require('dotenv').config();

//** GESTION DE PERFIL DE USUARIOS **
exports.updateProfile = [
  body('name').optional().isString().trim().escape(),
  body('address').optional().isObject().custom(userServices.validateAddressFields),
  body('phone').optional().isString().trim().escape(),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

      if (req.body.name) user.name = req.body.name;
      if (req.body.phone) user.phone = req.body.phone;
      if (req.body.address) await userServices.updateOrCreateAddress(userId, req.body.address);

      await user.save();
      res.status(200).json({ message: 'Perfil actualizado exitosamente', user });
    } catch (error) {
      res.status(500).json({ message: 'Error al actualizar el perfil', error: error.message });
    }
  }
];

exports.addAddress = [
  body('street').isString().trim().notEmpty().withMessage('La calle es obligatoria.'),
  body('city').isString().trim().notEmpty().withMessage('La ciudad es obligatoria.'),
  body('state').isString().trim().notEmpty().withMessage('El estado es obligatorio.'),
  body('postal_code').isString().trim().notEmpty().withMessage('El código postal es obligatorio.'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const addressData = { street: req.body.street, city: req.body.city, state: req.body.state, postal_code: req.body.postal_code };
      const address = await userServices.updateOrCreateAddress(userId, addressData);
      res.status(201).json({ message: 'Dirección agregada/actualizada exitosamente', address });
    } catch (error) {
      res.status(500).json({ message: 'Error al agregar la dirección', error: error.message });
    }
  }
];

exports.updateUserProfile = [
  body('address').isObject().custom(userServices.validateAddressFields),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });

      const address = await userServices.updateOrCreateAddress(userId, req.body.address);
      res.status(200).json({ message: 'Dirección actualizada correctamente', address });
    } catch (error) {
      res.status(500).json({ message: 'Error al actualizar la dirección', error: error.message });
    }
  }
];

exports.getProfile = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'name', 'email', 'phone', 'status', 'user_type'],
      include: [{ model: Address, where: { is_primary: true }, required: false }]
    });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener el perfil', error: error.message });
  }
};

//** ELIMINACION DE CUENTAS **
exports.deleteMyAccount = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Usuario no encontrado');
      return res.status(404).json({ message: 'Usuario no encontrado' });
    }
    if (user.user_type !== 'cliente') {
      loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Intento no autorizado de eliminar una cuenta de tipo no cliente');
      return res.status(403).json({ message: 'Solo los usuarios de tipo cliente pueden eliminar su propia cuenta.' });
    }

    await sequelize.transaction(async (transaction) => {
      await userServices.deleteUserRelatedData(userId, transaction);
      await user.destroy({ transaction });
    });

    loggerUtils.logUserActivity(userId, 'account_deletion', 'Cuenta eliminada exitosamente');
    res.status(200).json({ message: 'Tu cuenta y todos los registros relacionados han sido eliminados exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar tu cuenta', error: error.message });
  }
};

exports.deleteCustomerAccount = [
  body('id').isInt().withMessage('ID de usuario no válido.'),

  async (req, res) => {
    const userId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
      if (user.user_type !== 'cliente') return res.status(403).json({ message: 'Solo los usuarios de tipo cliente pueden ser eliminados.' });

      await sequelize.transaction(async (transaction) => {
        await userServices.deleteUserRelatedData(userId, transaction);
        await user.destroy({ transaction });
      });

      res.status(200).json({ message: 'Cuenta de cliente eliminada exitosamente junto con todos los registros relacionados.' });
    } catch (error) {
      res.status(500).json({ message: 'Error al eliminar la cuenta de cliente', error: error.message });
    }
  }
];

//** ADMINISTRACION DE USUARIOS (SOLO PARA ADMINISTRADORES) **
exports.getAllUsersWithSessions = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['user_id', 'name', 'email', 'status', 'user_type'],
      include: [{ model: Address, where: { is_primary: true }, required: false }]
    });

    const usersWithSessions = await Promise.all(users.map(async (user) => {
      const sessions = await Session.findAll({
        where: { user_id: user.user_id, revoked: false },
        order: [['last_activity', 'DESC']]
      });
      return {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        status: user.status,
        address: user.Address,
        session_active: sessions.length > 0,
        ...(sessions.length > 0 && {
          last_session: { last_activity: sessions[0].last_activity, browser: sessions[0].browser }
        })
      };
    }));

    res.status(200).json(usersWithSessions);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener los usuarios y sesiones', error: error.message });
  }
};

exports.deactivateAccount = [
  body('userId').isInt().withMessage('ID de usuario no válido.'),
  body('action').isIn(['block', 'suspend', 'activate']).withMessage('Acción inválida. Las acciones válidas son: block, suspend, activate'),

  async (req, res) => {
    const { userId, action } = req.body;
    const adminId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
      if (user.user_id === adminId) return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propia cuenta' });

      user.status = action === 'block' ? 'bloqueado' : action === 'suspend' ? 'bloqueado_permanente' : 'activo';
      await user.save();
      res.status(200).json({ message: `Cuenta ${action} exitosamente`, user });
    } catch (error) {
      res.status(500).json({ message: `Error al ${action} la cuenta del usuario`, error: error.message });
    }
  }
];