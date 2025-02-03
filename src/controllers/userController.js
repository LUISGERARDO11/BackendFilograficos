const { body, validationResult } = require('express-validator');
const { User, Account, Address, Session, PasswordHistory } = require('../models/Associations');
const FailedAttempt = require('../models/Failedattempts'); 
const loggerUtils = require('../utils/loggerUtils');
require('dotenv').config();

//** GESTION DE PERFIL DE USUARIOS  **
// Actualización del perfil del usuario (nombre, dirección, teléfono)
exports.updateProfile = [
    // Validar y sanitizar entradas
    body('name').optional().isString().trim().escape(),
    body('address').optional().isObject().custom(value => {
        // Validar campos de dirección
        if (!value.street || !value.city || !value.state || !value.postal_code) {
            throw new Error('Todos los campos de la dirección son obligatorios (calle, ciudad, estado, código postal).');
        }
        return true;
    }),
    body('phone').optional().isString().trim().escape(),

    async (req, res) => {
        const userId = req.user.user_id;

        // Validar entradas
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            // Actualizar campos permitidos
            if (req.body.name) user.name = req.body.name;
            if (req.body.phone) user.phone = req.body.phone;

            // Actualizar o crear la dirección
            if (req.body.address) {
                const [address] = await Address.findOrCreate({
                    where: { user_id: userId, is_primary: true },
                    defaults: { ...req.body.address, is_primary: true }
                });

                await address.update(req.body.address);
            }

            await user.save();
            res.status(200).json({ message: 'Perfil actualizado exitosamente', user });
        } catch (error) {
            res.status(500).json({ message: 'Error al actualizar el perfil', error: error.message });
        }
    }
];

// Actualizar solo la dirección del usuario
exports.updateUserProfile = [
    // Validar y sanitizar entradas
    body('address').isObject().custom(value => {
        // Validar campos de dirección
        if (!value.street || !value.city || !value.state || !value.postal_code) {
            throw new Error('Todos los campos de la dirección son obligatorios (calle, ciudad, estado, código postal).');
        }
        return true;
    }),

    async (req, res) => {
        const userId = req.user.user_id;

        // Validar entradas
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            // Actualizar o crear la dirección
            const [address] = await Address.findOrCreate({
                where: { user_id: userId, is_primary: true },
                defaults: { ...req.body.address, is_primary: true }
            });

            await address.update(req.body.address);

            res.status(200).json({
                message: 'Dirección actualizada correctamente',
                address
            });
        } catch (error) {
            res.status(500).json({ message: 'Error al actualizar la dirección', error: error.message });
        }
    }
];

// Función para obtener el perfil del usuario autenticado
exports.getProfile = async (req, res) => {
    const userId = req.user.user_id; // Asumiendo que `authMiddleware` agrega `req.user`
    
    try {
        const user = await User.findByPk(userId, {
            attributes: ['user_id', 'name', 'email', 'phone', 'status', 'user_type'],
            include: [{
                model: Address,
                where: { is_primary: true },
                required: false
            }]
        });

        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        res.status(200).json(user); // Retornar el usuario con su dirección primaria
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener el perfil', error: error.message });
    }
};

//** ELIMINCACIÓN DE CUENTAS  **
// Eliminar la cuenta del cliente autenticado
exports.deleteMyAccount = async (req, res) => {
    const userId = req.user.user_id; // ID del usuario autenticado

    try {
        // Buscar al usuario por su ID
        const user = await User.findByPk(userId);
        if (!user) {
            loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Usuario no encontrado');
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Verificar que el usuario sea de tipo "cliente"
        if (user.user_type !== 'cliente') {
            loggerUtils.logUserActivity(userId, 'account_deletion_failed', 'Intento no autorizado de eliminar una cuenta de tipo no cliente');
            return res.status(403).json({ message: 'Solo los usuarios de tipo cliente pueden eliminar su propia cuenta.' });
        }

        // Eliminar el usuario y sus registros relacionados
        await sequelize.transaction(async (transaction) => {
            // Eliminar la cuenta del usuario
            await Account.destroy({ where: { user_id: userId }, transaction });

            // Eliminar el historial de contraseñas
            await PasswordHistory.destroy({ where: { account_id: userId }, transaction });

            // Eliminar los intentos fallidos de inicio de sesión
            await FailedAttempt.destroy({ where: { user_id: userId }, transaction });

            // Eliminar las sesiones activas del usuario
            await Session.destroy({ where: { user_id: userId }, transaction });

            // Eliminar las direcciones del usuario
            await Address.destroy({ where: { user_id: userId }, transaction });

            // Eliminar el usuario
            await user.destroy({ transaction });
        });

        // Registrar la eliminación de la cuenta
        loggerUtils.logUserActivity(userId, 'account_deletion', 'Cuenta eliminada exitosamente');

        // Responder con éxito
        res.status(200).json({ message: 'Tu cuenta y todos los registros relacionados han sido eliminados exitosamente.' });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al eliminar tu cuenta', error: error.message });
    }
};

// Eliminar todo lo relacionado con un usuario de tipo cliente (solo para administradores)
exports.deleteCustomerAccount = [
    // Validar y sanitizar entradas
    body('id').isInt().withMessage('ID de usuario no válido.'),

    async (req, res) => {
        const userId = req.params.id;

        // Validar entradas
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            if (user.user_type !== 'cliente') {
                return res.status(403).json({ message: 'Solo los usuarios de tipo cliente pueden ser eliminados.' });
            }

            // Eliminar el usuario y sus registros relacionados
            await sequelize.transaction(async (transaction) => {
                // Eliminar la cuenta del usuario
                await Account.destroy({ where: { user_id: userId }, transaction });

                // Eliminar el historial de contraseñas
                await PasswordHistory.destroy({ where: { account_id: userId }, transaction });

                // Eliminar los intentos fallidos de inicio de sesión
                await FailedAttempt.destroy({ where: { user_id: userId }, transaction });

                // Eliminar las sesiones activas del usuario
                await Session.destroy({ where: { user_id: userId }, transaction });

                // Eliminar las direcciones del usuario
                await Address.destroy({ where: { user_id: userId }, transaction });

                // Eliminar el usuario
                await user.destroy({ transaction });
            });

            res.status(200).json({ message: 'Cuenta de cliente eliminada exitosamente junto con todos los registros relacionados.' });
        } catch (error) {
            res.status(500).json({ message: 'Error al eliminar la cuenta de cliente', error: error.message });
        }
    }
];

//** ADMINISTRACIÓN DE USUARIOS (SOLO PARA ADMINISTRADORES)  **
// Obtener todos los usuarios con la sesión más reciente (solo accesible por administradores)
exports.getAllUsersWithSessions = async (req, res) => {
    try {
        // Obtener todos los usuarios
        const users = await User.findAll({
            attributes: ['user_id', 'name', 'email', 'status', 'user_type'],
            include: [{
                model: Address,
                where: { is_primary: true },
                required: false
            }]
        });

        // Crear una lista de usuarios con su sesión activa más reciente o estado de sesión inactiva
        const usersWithSessions = await Promise.all(users.map(async (user) => {
            // Buscar las sesiones activas del usuario
            const sessions = await Session.findAll({
                where: { user_id: user.user_id, revoked: false },
                order: [['last_activity', 'DESC']]
            });

            // Si el usuario tiene al menos una sesión activa, devolver la más reciente
            if (sessions.length > 0) {
                return {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email,
                    status: user.status,
                    address: user.Address,
                    session_active: true,
                    last_session: {
                        last_activity: sessions[0].last_activity,
                        browser: sessions[0].browser
                    }
                };
            } else {
                // Si no tiene sesiones activas, marcar como inactiva
                return {
                    user_id: user.user_id,
                    name: user.name,
                    email: user.email,
                    status: user.status,
                    address: user.Address,
                    session_active: false
                };
            }
        }));

        // Devolver la lista de usuarios con sus respectivas sesiones
        res.status(200).json(usersWithSessions);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener los usuarios y sesiones', error: error.message });
    }
};

// Desactivar o bloquear una cuenta de usuario (solo para administradores)
exports.deactivateAccount = [
    // Validar y sanitizar entradas
    body('userId').isInt().withMessage('ID de usuario no válido.'),
    body('action').isIn(['block', 'suspend', 'activate']).withMessage('Acción inválida. Las acciones válidas son: block, suspend, activate'),

    async (req, res) => {
        const { userId, action } = req.body;
        const adminId = req.user.user_id;

        // Validar entradas
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const user = await User.findByPk(userId);
            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            if (user.user_id === adminId) {
                return res.status(400).json({ message: 'No puedes desactivar o bloquear tu propia cuenta' });
            }

            // Actualizar el estado de la cuenta según la acción
            switch (action) {
                case 'block':
                    user.status = 'blocked';
                    break;
                case 'suspend':
                    user.status = 'suspended';
                    break;
                case 'activate':
                    user.status = 'active';
                    break;
                default:
                    return res.status(400).json({ message: 'Acción no reconocida' });
            }

            await user.save();
            res.status(200).json({ message: `Cuenta ${action} exitosamente`, user });
        } catch (error) {
            res.status(500).json({ message: `Error al ${action} la cuenta del usuario`, error: error.message });
        }
    }
];