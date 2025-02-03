const { body, validationResult } = require('express-validator');
const { User, Account, Session, Passwordstatus, Passwordhistory, Passwordrecovery } = require('../models/Associations');
const authService = require('../services/authService');
const userService = require('../services/userServices');
const emailService = require('../services/emailService');
const loggerUtils = require('../utils/loggerUtils');
const authUtils = require('../utils/authUtils');

//** GESTION DE CONTRASEÑAS **
// 1: CAMBIAR CONTRASEÑA: 
//Método para cambiar la contraseña del usuario autenticado para cuando un usuario cambia su contraseña sabiendo la actual y colocando una nueva
exports.changePassword = [
    // Validar y sanitizar entradas
    body('currentPassword').not().isEmpty().trim().escape(),
    body('newPassword').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres').trim().escape(),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const userId = req.user.user_id;
        const { currentPassword, newPassword } = req.body;

        try {
            // Buscar la cuenta del usuario
            const account = await Account.findOne({ where: { user_id: userId } });
            if (!account) {
                loggerUtils.logUserActivity(userId, 'password_change_failed', 'Cuenta no encontrada');
                return res.status(404).json({ message: 'Cuenta no encontrada' });
            }

            // Verificar la contraseña actual
            const isMatch = await authService.verifyPassword(currentPassword, account.password_hash);
            if (!isMatch) {
                loggerUtils.logUserActivity(userId, 'password_change_failed', 'Contraseña actual incorrecta');
                return res.status(400).json({ message: 'Contraseña actual incorrecta' });
            }

            // Verificar si la nueva contraseña es diferente a las anteriores
            const isNewPasswordValid = await authService.isNewPasswordValid(account.account_id, newPassword);
            if (!isNewPasswordValid) {
                loggerUtils.logUserActivity(userId, 'password_change_failed', 'La nueva contraseña no puede ser igual a las anteriores');
                return res.status(400).json({ message: 'La nueva contraseña no puede ser igual a las anteriores' });
            }

            // Cifrar la nueva contraseña
            const newHashedPassword = await authService.hashPassword(newPassword);

            // Actualizar la contraseña en la cuenta
            account.password_hash = newHashedPassword;
            await account.save();

            // Actualizar el estado de la contraseña
            await Passwordstatus.update(
                { last_change_date: new Date() },
                { where: { account_id: account.account_id } }
            );

            // Registrar la nueva contraseña en el historial
            await Passwordhistory.create({
                account_id: account.account_id,
                password_hash: newHashedPassword,
                change_date: new Date()
            });

            // Revocar todas las sesiones activas
            await Session.update(
                { revoked: true },
                { where: { user_id: userId, revoked: false } }
            );

            // Enviar notificación de cambio de contraseña
            const user = await User.findByPk(userId);
            if (user) {
                await authService.sendPasswordChangeNotification(user.email);
            }

            // Registrar el cambio de contraseña exitoso
            loggerUtils.logUserActivity(userId, 'password_change', 'Contraseña actualizada exitosamente');

            res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
        } catch (error) {
            res.status(500).json({ message: 'Error al cambiar la contraseña', error: error.message });
        }
    }
];

//2:RECUPERACIÓN DE CONTRASEÑA
// Método para iniciar el proceso de recuperación de contraseña
exports.initiatePasswordRecovery = async (req, res) => {
    const { email } = req.body;

    try {
        // Buscar al usuario por su correo
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Buscar la cuenta asociada al usuario
        const account = await Account.findOne({ where: { user_id: user.user_id } });
        if (!account) {
            return res.status(404).json({ message: 'Cuenta no encontrada.' });
        }

        // Generar un token de recuperación
        const recoveryToken = authUtils.generateOTP();
        const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

        // Guardar el token en la tabla PasswordRecovery
        await Passwordrecovery.create({
            account_id: account.account_id,
            recovery_token: recoveryToken,
            token_expiration: expiration,
            is_token_valid: true
        });

        // Enviar el token por correo electrónico
        await emailService.sendOTPEmail(user.email, recoveryToken);

        res.status(200).json({ message: 'Se ha enviado un código de recuperación a tu correo electrónico.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al iniciar el proceso de recuperación de contraseña.', error: error.message });
    }
};

//metodo para verificar el codigo otp para recuperacion de contraseña
exports.verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    try {
        // Buscar al usuario por su correo
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        // Buscar la cuenta asociada al usuario
        const account = await Account.findOne({ where: { user_id: user.user_id } });
        if (!account) {
            return res.status(404).json({ message: 'Cuenta no encontrada.' });
        }

        // Buscar el token de recuperación
        const recovery = await Passwordrecovery.findOne({
            where: {
                account_id: account.account_id,
                recovery_token: otp,
                is_token_valid: true,
                token_expiration: { [Op.gt]: new Date() }
            }
        });

        if (!recovery) {
            return res.status(400).json({ message: 'El código OTP no es válido o ha expirado.' });
        }

        // Invalidar el token después de su uso
        await recovery.update({ is_token_valid: false });

        res.status(200).json({ 
            message: 'OTP verificado correctamente. Puedes proceder a cambiar tu contraseña.',
            status: 'success'
        });
    } catch (error) {
        res.status(500).json({ message: 'Error al verificar el código OTP.', error: error.message });
    }
};

//metodo para reestablecer una contraseña
exports.resetPassword = [
    // Validar y sanitizar entradas
    body('email').isEmail().withMessage('Debe proporcionar un correo electrónico válido').normalizeEmail(),
    body('newPassword').isLength({ min: 8 }).withMessage('La nueva contraseña debe tener al menos 8 caracteres').trim().escape(),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, newPassword } = req.body;

        try {
            // Buscar al usuario por su correo
            const user = await User.findOne({ where: { email } });
            if (!user) {
                loggerUtils.logUserActivity(null, 'password_reset_failed', `Usuario no encontrado para el correo: ${email}`);
                return res.status(404).json({ message: 'Usuario no encontrado.' });
            }

            // Buscar la cuenta asociada al usuario
            const account = await Account.findOne({ where: { user_id: user.user_id } });
            if (!account) {
                loggerUtils.logUserActivity(user.user_id, 'password_reset_failed', 'Cuenta no encontrada');
                return res.status(404).json({ message: 'Cuenta no encontrada.' });
            }

            // Verificar si la nueva contraseña es diferente a las anteriores
            const isNewPasswordValid = await userService.trackPasswordHistory(account.account_id, newPassword);
            if (!isNewPasswordValid) {
                loggerUtils.logUserActivity(user.user_id, 'password_reset_failed', 'La nueva contraseña no puede ser igual a las anteriores');
                return res.status(400).json({ message: 'La nueva contraseña no puede ser igual a las anteriores' });
            }

            // Cifrar la nueva contraseña
            const newHashedPassword = await authService.hashPassword(newPassword);

            // Actualizar la contraseña en la cuenta
            account.password_hash = newHashedPassword;
            await account.save();

            // Registrar la nueva contraseña en el historial
            await Passwordhistory.create({
                account_id: account.account_id,
                password_hash: newHashedPassword,
                change_date: new Date()
            });

            // Revocar todas las sesiones activas
            await Session.update(
                { revoked: true },
                { where: { user_id: user.user_id, revoked: false } }
            );

            // Enviar notificación de cambio de contraseña
            await emailService.sendPasswordChangeNotification(user.email);

            // Registrar el cambio de contraseña exitoso
            loggerUtils.logUserActivity(user.user_id, 'password_reset', 'Contraseña restablecida exitosamente');

            res.status(200).json({ message: 'Contraseña actualizada exitosamente.' });
        } catch (error) {
            res.status(500).json({ message: 'Error al cambiar la contraseña.', error: error.message });
        }
    }
];

//3: VERIFICAR SI LA CONTRASEÑA ESTÁ COMPROMETIDA
// Controlador para verificar si una contraseña está comprometida
exports.checkPassword = (req, res) => {
    const { password } = req.body;

    if (!password) {
        return res.status(400).json({ error: 'Debe proporcionar una contraseña' });
    }

    const isCompromised = authUtils.isPasswordCompromised(password);

    if (isCompromised) {
        return res.json({ 
            status: 'compromised', 
            message: 'La contraseña ha sido filtrada. Por favor, elige una más segura.' 
        });
    } else {
        return res.json({ 
            status: 'safe', 
            message: 'La contraseña no se encuentra en la lista de contraseñas filtradas.' 
        });
    }
};