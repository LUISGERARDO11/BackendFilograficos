/* The above code is a Node.js application that handles user registration, email verification, login,
logout, and two-factor authentication (2FA) using OTP (One-Time Password). Here is a summary of the
main functionalities: */
const { body, validationResult } = require('express-validator');
const { User, Account, Session, TwoFactorConfig, PasswordStatus } = require('../models/Associations')
const Config = require('../models/Systemconfig');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const loggerUtils = require('../utils/loggerUtils');
const authUtils = require('../utils/authUtils');
const crypto = require('crypto');
const axios = require('axios');
require('dotenv').config();

//** GESTION DE USUARIOS  **
// Registro de usuarios
exports.register = [
    // Validar y sanitizar entradas
    body('name').isString().trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('phone').isString().trim().escape(),
    body('password').isLength({ min: 8 }).withMessage('La contraseña debe tener al menos 8 caracteres').trim().escape(),
    body('user_type').isIn(['cliente', 'administrador']).withMessage('Tipo de usuario no válido'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, email, phone, password, user_type } = req.body;

        try {
            // Validar si el usuario ya existe
            let existingUser = await User.findOne({ where: { email } });
            if (existingUser) {
                return res.status(400).json({ message: 'El correo ya está en uso.' });
            }

            // Crear el nuevo usuario
            const newUser = await User.create({
                name,
                email,
                phone,
                user_type,
                status: 'pendiente'
            });

            // Cifrar la contraseña utilizando el servicio
            const hashedPassword = await authService.hashPassword(password);

            // Crear una cuenta vinculada al usuario
            const newAccount = await Account.create({
                user_id: newUser.user_id,
                password_hash: hashedPassword,
                last_access: new Date(),
                max_failed_login_attempts: 5
            });

            // Crear el estado de la contraseña
            await PasswordStatus.create({
                account_id: newAccount.account_id,
                requires_change: false,
                last_change_date: new Date()
            });

            // Generar token de verificación
            const verificationToken = crypto.randomBytes(32).toString('hex');

            // Obtener el tiempo de vida del token de verificación desde la base de datos
            const config = await Config.findOne();
            const verificationLifetime = config?.email_verification_lifetime 
                ? config.email_verification_lifetime * 1000 
                : 24 * 60 * 60 * 1000; // 24 horas por defecto

            // Verifica que el tiempo de vida sea un número válido
            if (isNaN(verificationLifetime)) {
                throw new Error("El tiempo de vida del token de verificación es inválido");
            }

            // Asigna la fecha de expiración correctamente
            newUser.email_verification_expiration = new Date(Date.now() + verificationLifetime);
            await newUser.save();

            await emailService.sendVerificationEmail(newUser.email, verificationToken);

            // Registrar actividad de creación de usuario
            loggerUtils.logUserActivity(newUser.user_id, 'account_creation', 'Usuario registrado exitosamente');

            res.status(201).json({ message: 'Usuario registrado exitosamente', user: newUser });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error en el registro de usuario', error: error.message });
        }
    }
];

// Verificar el correo electrónico del usuario
exports.verifyEmail = async (req, res) => {
    const { token } = req.query;

    try {
        // Buscar al usuario con el token de verificación
        const user = await User.findOne({
            where: {
                email_verification_token: token,
                email_verification_expiration: { [Op.gt]: Date.now() } // Verificar que el token no ha expirado
            }
        });

        if (!user) {
            return res.status(400).json({ message: 'Token inválido o expirado.' });
        }

        // Activar la cuenta del usuario
        user.status = 'activo';
        user.email_verification_token = null; // Limpiar el token
        user.email_verification_expiration = null;
        await user.save();

        // Redirigir al usuario a la página de inicio de sesión del frontend
        const baseUrls = {
            development: ['http://localhost:3000', 'http://localhost:4200', 'http://127.0.0.1:4200', 'http://127.0.0.1:3000'],
            production: ['https://web-filograficos.vercel.app']
        };

        const currentEnv = baseUrls[process.env.NODE_ENV] ? process.env.NODE_ENV : 'development';
        const loginUrl = `${baseUrls[currentEnv][0]}/login`;

        res.redirect(loginUrl);

    } catch (error) {
        res.status(500).json({ message: 'Error al verificar el correo', error: error.message });
    }
};

// Inicio de sesión
exports.login = [
    // Validar y sanitizar entradas
    body('email').isEmail().normalizeEmail(),
    body('password').not().isEmpty().trim().escape(),
    body('recaptchaToken').not().isEmpty().withMessage('Se requiere el token de reCAPTCHA'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { email, password, recaptchaToken } = req.body;

        try {
            // 1. Verificar el token de reCAPTCHA con la API de Google
            const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
            const recaptchaResponse = await axios.post(`https://www.google.com/recaptcha/api/siteverify`, null, {
                params: {
                    secret: recaptchaSecretKey,
                    response: recaptchaToken
                }
            });

            const { success, score } = recaptchaResponse.data;
            if (!success || score < 0.5) {
                return res.status(400).json({ message: 'Fallo en la verificación de reCAPTCHA' });
            }

            // Buscar al usuario y su cuenta vinculada
            const user = await User.findOne({ where: { email } });
            if (!user) {
                loggerUtils.logUserActivity(null, 'login_failed', `Intento de inicio de sesión fallido para email no encontrado: ${email}`);
                return res.status(400).json({ message: 'Usuario no encontrado' });
            }

            // Verificar si el estado del usuario es "pendiente"
            if (user.status === 'pendiente') {
                loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Intento de inicio de sesión con cuenta pendiente de verificación');
                return res.status(403).json({ message: 'Debes verificar tu correo electrónico antes de iniciar sesión.' });
            }

            const account = await Account.findOne({ where: { user_id: user.user_id } });
            if (!account) {
                loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Intento de inicio de sesión fallido: cuenta no encontrada');
                return res.status(400).json({ message: 'Cuenta no encontrada' });
            }

            const bloqueado = await authService.isUserBlocked(user.user_id);
            if (bloqueado.blocked) {
                loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Cuenta bloqueada');
                return res.status(403).json({ message: bloqueado.message });
            }

            // Verificar la contraseña utilizando el servicio
            const isMatch = await authService.verifyPassword(password, account.password_hash);
            if (!isMatch) {
                // Manejar el intento fallido
                const result = await authService.handleFailedAttempt(user.user_id, req.ip);
                if (result.locked) {
                    loggerUtils.logUserActivity(user.user_id, 'account_locked', 'Cuenta bloqueada por intentos fallidos');
                    return res.status(403).json({ locked: true, message: 'Tu cuenta ha sido bloqueada debido a múltiples intentos fallidos. Debes cambiar tu contraseña.' });
                }
                return res.status(400).json({ message: 'Credenciales incorrectas', ...result });
            }

            // Limpiar los intentos fallidos si el inicio de sesión fue exitoso
            await authService.clearFailedAttempts(user.user_id);

            // **2. Limitar el número de sesiones activas**
            const activeSessionsCount = await Session.count({ where: { user_id: user.user_id, revoked: false } });

            if (user.user_type === 'cliente' && activeSessionsCount >= 5) {
                loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Límite de sesiones activas alcanzado');
                return res.status(403).json({ message: 'Límite de sesiones activas alcanzado (5 sesiones permitidas).' });
            }

            if (user.user_type === 'administrador' && activeSessionsCount >= 2) {
                loggerUtils.logUserActivity(user.user_id, 'login_failed', 'Límite de sesiones activas alcanzado');
                return res.status(403).json({ message: 'Límite de sesiones activas alcanzado (2 sesiones permitidas para administradores).' });
            }

            const mfaConfig = await TwoFactorConfig.findOne({ where: { account_id: account.account_id } });

            if (mfaConfig && mfaConfig.enabled) {
                return res.status(200).json({
                    message: 'MFA requerido. Se ha enviado un código de autenticación.',
                    mfaRequired: true,
                    userId: user.user_id
                });
            }

            // Si MFA no está habilitado, Generar el JWT utilizando el servicio
            const token = await authService.generateJWT(user);

            // Buscar el tiempo de vida de la sesión
            const config = await Config.findOne();
            const sesionLifetime = config ? config.session_lifetime * 1000 : 3600000; // 1 hora por defecto

            // Guardar la sesión
            const newSession = await Session.create({
                user_id: user.user_id,
                token,
                last_activity: new Date(),
                expiration: new Date(Date.now() + sesionLifetime),
                ip: req.ip,
                browser: req.headers['user-agent'],
                revoked: false
            });

            // Registrar el inicio de sesión exitoso
            loggerUtils.logUserActivity(user.user_id, 'login', 'Inicio de sesión exitoso');

            const cookieLifetime = config ? config.cookie_lifetime * 1000 : 3600000;

            // Establecer la cookie con el token
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'None',
                maxAge: cookieLifetime // 1 hora
            });

            res.status(200).json({ userId: user.user_id, tipo: user.user_type, message: 'Inicio de sesión exitoso' });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error en el inicio de sesión', error: error.message });
        }
    }
];

// Cerrar sesión del usuario (elimina el token de la sesión actual)
exports.logout = async (req, res) => {
    const token = req.cookies.token; // Obtener el token de la cookie

    if (!token) {
        return res.status(401).json({ 
            message: "No se proporcionó un token. Ya estás cerrado sesión o nunca iniciaste sesión." 
        });
    }

    try {
        // Obtener el ID del usuario autenticado del middleware
        const userId = req.user ? req.user.user_id : null;

        if (!userId) {
            return res.status(400).json({ message: "Usuario no autenticado." });
        }

        // Buscar la sesión correspondiente al token actual
        const session = await Session.findOne({ 
            where: { 
                user_id: userId, 
                token: token 
            } 
        });

        if (!session) {
            return res.status(404).json({ message: 'Sesión no encontrada.' });
        }

        // Validar si la sesión ya fue cerrada/revocada
        if (session.revoked) {
            return res.status(400).json({ message: 'La sesión ya fue cerrada anteriormente.' });
        }

        // Marcar la sesión como revocada
        session.revoked = true;
        await session.save();

        // Limpiar la cookie del token para cerrar la sesión del usuario
        res.clearCookie('token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
        });

        // Responder con un mensaje de éxito
        res.status(200).json({ message: 'Sesión cerrada exitosamente.' });
    } catch (error) {
        return res.status(500).json({ 
            message: 'Error al cerrar sesión', 
            error: error.message 
        });
    }
};

//** SEGURIDAD Y AUTENTICACIÓN MULTIFACTOR **
// Inicia el proceso para autenticacion en dos pasos
exports.sendOtpMfa = async (req, res) => {
    const { userId } = req.body;

    try {
        // Buscar la cuenta del usuario por userId
        const account = await Account.findOne({ 
            where: { user_id: userId },
            include: [User]
        });
        
        if (!account || !account.User) {
            return res.status(404).json({ message: 'Cuenta o usuario no encontrado.' });
        }

        // Obtener la configuración de tiempo de vida del OTP desde la base de datos
        const config = await Config.findOne();
        const otpLifetime = config ? config.otp_lifetime * 1000 : 15 * 60 * 1000;

        // Generar OTP y definir expiración
        const otp = authUtils.generateOTP();
        const expiration = new Date(Date.now() + otpLifetime);

        // Crear o actualizar la configuración 2FA
        const [twofactorconfig] = await TwoFactorConfig.findOrCreate({
            where: { account_id: account.account_id },
            defaults: {
                mfa_type: 'OTP',
                enabled: true,
                code: otp,
                code_expires: expiration,
                attempts: 0,
                is_valid: true
            }
        });

        // Actualizar si ya existía
        await twofactorconfig.update({
            code: otp,
            code_expires: expiration,
            attempts: 0,
            is_valid: true
        });

        // Enviar el OTP por correo electrónico
        await emailService.sendMFAOTPEmail(account.User.email, otp);

        res.status(200).json({ success: true, message: 'OTP enviado correctamente.' });
    } catch (error) {
        res.status(500).json({ message: 'Error al enviar el OTP.', error: error.message });
    }
};

//Verificar el codigo mfa 
exports.verifyOTPMFA = async (req, res) => {
    const { userId, otp } = req.body;

    try {
        // Buscar usuario y cuenta asociada
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }

        const account = await Account.findOne({ where: { user_id: user.user_id } });
        if (!account) {
            return res.status(404).json({ message: 'Cuenta no encontrada.' });
        }

        // Obtener configuración 2FA
        const twoFactorConfig = await Twofactorconfig.findOne({
            where: { account_id: account.account_id }
        });

        if (!twoFactorConfig || !twoFactorConfig.is_valid || new Date() > twoFactorConfig.code_expires) {
            return res.status(400).json({ message: 'El código OTP ha expirado o es inválido.' });
        }

        // Verificar código
        if (otp !== twoFactorConfig.code) {
            const newAttempts = twoFactorConfig.attempts + 1;
            const remainingAttempts = 3 - newAttempts;
            
            await twoFactorConfig.update({
                attempts: newAttempts,
                is_valid: newAttempts >= 3 ? false : twoFactorConfig.is_valid
            });

            return res.status(400).json({ 
                message: `OTP incorrecto. Intentos restantes: ${remainingAttempts}.`,
                attemptsRemaining: remainingAttempts
            });
        }

        // Invalidar código después de uso exitoso
        await twoFactorConfig.update({
            is_valid: false,
            attempts: 0
        });

        // Generar JWT
        const token = await authService.generateJWT(user);

        // Configurar tiempo de sesión
        const config = await Config.findOne();
        const sesionLifetime = config ? config.session_lifetime * 1000 : 3600000;

        // Crear nueva sesión
        const newSession = await Session.create({
            user_id: user.user_id,
            token: token,
            last_activity: new Date(),
            expiration: new Date(Date.now() + sesionLifetime),
            ip: req.ip,
            browser: req.headers['user-agent'],
            revoked: false
        });

        // Configurar cookie
        const cookieLifetime = config ? config.cookie_lifetime * 1000 : 3600000;
        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'None',
            maxAge: cookieLifetime
        });

        res.status(200).json({ 
            success: true, 
            userId: user.user_id, 
            userType: user.user_type,
            message: 'OTP verificado correctamente. Inicio de sesión exitoso.' 
        });

    } catch (error) {
        res.status(500).json({ message: 'Error al verificar el OTP.', error: error.message });
    }
};