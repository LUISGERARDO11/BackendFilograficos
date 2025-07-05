/* The above code is a set of functions related to user profile management, account deletion, and user
administration in a Node.js application using Express and Sequelize ORM. Here is a summary of the
functionalities: */
const { body, validationResult } = require('express-validator');
const { User, Account, Address, Session } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const userServices = require('../services/userServices');
const { uploadProfilePictureToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
require('dotenv').config();

//** GESTION DE PERFIL DE USUARIOS **
exports.updateProfile = [
  body('name').optional().isString().trim().escape(),
  body('address').optional().isObject().custom(userServices.validateAddressFields),
  body('phone').optional().isString().trim().escape(),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

      if (req.body.name) user.name = req.body.name;
      if (req.body.phone) user.phone = req.body.phone;
      if (req.body.address) await userServices.updateOrCreateAddress(userId, req.body.address);

      await user.save();
      res.status(200).json({ success: true, message: 'Perfil actualizado exitosamente', user });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al actualizar el perfil', error: error.message });
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
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });

    try {
      const addressData = { street: req.body.street, city: req.body.city, state: req.body.state, postal_code: req.body.postal_code };
      const address = await userServices.updateOrCreateAddress(userId, addressData);
      res.status(201).json({ success: true, message: 'Dirección agregada/actualizada exitosamente', address });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al agregar la dirección', error: error.message });
    }
  }
];

exports.updateUserProfile = [
  body('address').isObject().custom(userServices.validateAddressFields),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });

      const address = await userServices.updateOrCreateAddress(userId, req.body.address);
      res.status(200).json({ success: true, message: 'Dirección actualizada correctamente', address });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al actualizar la dirección', error: error.message });
    }
  }
];

exports.getProfile = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const user = await User.findByPk(userId, {
      attributes: ['user_id', 'name', 'email', 'phone', 'status', 'user_type'],
      include: [
        { model: Address, where: { is_primary: true }, required: false },
        { model: Account, attributes: ['profile_picture_url'] }
      ]
    });
    if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    res.status(200).json({ success: true, user });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ success: false, message: 'Error al obtener el perfil', error: error.message });
  }
};

exports.uploadProfilePicture = async (req, res) => {
  const userId = req.user.user_id;
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No se proporcionó ninguna imagen' });
    }

    const account = await Account.findByPk(req.user.account_id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
    }

    // Si existe una foto de perfil previa, eliminarla de Cloudinary
    if (account.profile_picture_public_id) {
      try {
        await deleteFromCloudinary(account.profile_picture_public_id);
      } catch (error) {
        loggerUtils.logCriticalError(error);
        return res.status(500).json({ success: false, message: 'Error al eliminar la foto de perfil anterior', error: error.message });
      }
    }

    // Subir la nueva foto de perfil a Cloudinary
    const result = await uploadProfilePictureToCloudinary(req.file.buffer, userId);

    // Actualizar la cuenta con la nueva URL y public_id
    await account.update({
      profile_picture_url: result.secure_url,
      profile_picture_public_id: result.public_id
    });

    loggerUtils.logUserActivity(userId, 'profile_picture_upload', 'Foto de perfil subida exitosamente');
    res.status(200).json({
      success: true,
      message: 'Foto de perfil subida exitosamente',
      profile_picture_url: result.secure_url
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ success: false, message: 'Error al subir la foto de perfil', error: error.message });
  }
};

exports.deleteProfilePicture = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const account = await Account.findByPk(req.user.account_id);
    if (!account) {
      return res.status(404).json({ success: false, message: 'Cuenta no encontrada' });
    }

    if (!account.profile_picture_public_id) {
      return res.status(400).json({ success: false, message: 'No hay foto de perfil para eliminar' });
    }

    // Eliminar la foto de Cloudinary
    try {
      await deleteFromCloudinary(account.profile_picture_public_id);
    } catch (error) {
      loggerUtils.logCriticalError(error);
      return res.status(500).json({ success: false, message: 'Error al eliminar la foto de perfil de Cloudinary', error: error.message });
    }

    // Actualizar la cuenta para eliminar la URL y el public_id
    await account.update({
      profile_picture_url: null,
      profile_picture_public_id: null
    });

    loggerUtils.logUserActivity(userId, 'profile_picture_delete', 'Foto de perfil eliminada exitosamente');
    res.status(200).json({
      success: true,
      message: 'Foto de perfil eliminada exitosamente'
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ success: false, message: 'Error al eliminar la foto de perfil', error: error.message });
  }
};

//** ELIMINACION DE CUENTAS **
exports.deleteMyAccount = async (req, res) => {
  const userId = req.user.user_id;
  try {
    const user = await User.findByPk(userId);
    if (!user) {
      loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Usuario no encontrado');
      return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
    }
    if (user.user_type !== 'cliente') {
      loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Intento no autorizado de eliminar una cuenta de tipo no cliente');
      return res.status(403).json({ success: false, message: 'Solo los usuarios de tipo cliente pueden eliminar su propia cuenta.' });
    }

    const account = await Account.findByPk(req.user.account_id);
    if (account && account.profile_picture_public_id) {
      try {
        await deleteFromCloudinary(account.profile_picture_public_id);
      } catch (error) {
        loggerUtils.logCriticalError(error);
        return res.status(500).json({ success: false, message: 'Error al eliminar la foto de perfil de Cloudinary', error: error.message });
      }
    }

    await userServices.deleteUserRelatedData(userId);
    await user.destroy();

    loggerUtils.logUserActivity(userId, 'account_deletion', 'Cuenta eliminada exitosamente');
    res.status(200).json({ success: true, message: 'Tu cuenta y todos los registros relacionados han sido eliminados exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ success: false, message: 'Error al eliminar tu cuenta', error: error.message });
  }
};

exports.deleteCustomerAccount = [
  body('id').isInt().withMessage('ID de usuario no válido.'),

  async (req, res) => {
    const userId = req.params.id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      if (user.user_type !== 'cliente') return res.status(403).json({ success: false, message: 'Solo los usuarios de tipo cliente pueden ser eliminados.' });

      const account = await Account.findOne({ where: { user_id: userId } });
      if (account && account.profile_picture_public_id) {
        try {
          await deleteFromCloudinary(account.profile_picture_public_id);
        } catch (error) {
          loggerUtils.logCriticalError(error);
          return res.status(500).json({ success: false, message: 'Error al eliminar la foto de perfil de Cloudinary', error: error.message });
        }
      }

      await userServices.deleteUserRelatedData(userId);
      await user.destroy();

      res.status(200).json({ success: true, message: 'Cuenta de cliente eliminada exitosamente junto con todos los registros relacionados.' });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: 'Error al eliminar la cuenta de cliente', error: error.message });
    }
  }
];

//** ADMINISTRACION DE USUARIOS (SOLO PARA ADMINISTRADORES) **
exports.getAllUsersWithSessions = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ['user_id', 'name', 'email', 'status', 'user_type'],
      include: [
        { model: Address, where: { is_primary: true }, required: false },
        { model: Account, attributes: ['profile_picture_url'] }
      ]
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
        profile_picture_url: user.Account ? user.Account.profile_picture_url : null,
        session_active: sessions.length > 0,
        ...(sessions.length > 0 && {
          last_session: { last_activity: sessions[0].last_activity, browser: sessions[0].browser }
        })
      };
    }));

    res.status(200).json({ success: true, users: usersWithSessions });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ success: false, message: 'Error al obtener los usuarios y sesiones', error: error.message });
  }
};

exports.deactivateAccount = [
  body('userId').isInt().withMessage('ID de usuario no válido.'),
  body('action').isIn(['block', 'suspend', 'activate']).withMessage('Acción inválida. Las acciones válidas son: block, suspend, activate'),

  async (req, res) => {
    const { userId, action } = req.body;
    const adminId = req.user.user_id;
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });

    try {
      const user = await User.findByPk(userId);
      if (!user) return res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      if (user.user_id === adminId) return res.status(400).json({ success: false, message: 'No puedes desactivar o bloquear tu propia cuenta' });

      // Reemplazo del ternario anidado por un switch
      switch (action) {
        case 'block':
          user.status = 'bloqueado';
          break;
        case 'suspend':
          user.status = 'bloqueado_permanente';
          break;
        case 'activate':
          user.status = 'activo';
          break;
        default:
          return res.status(400).json({ success: false, message: 'Acción no reconocida' });
      }

      await user.save();
      res.status(200).json({ success: true, message: `Cuenta ${action} exitosamente`, user });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ success: false, message: `Error al ${action} la cuenta del usuario`, error: error.message });
    }
  }
];