const { body, validationResult } = require('express-validator');
const { User, Account, Session, PasswordStatus, PasswordHistory, PasswordRecovery } = require('../models/Associations');
const authService = require('../services/authService');
const userService = require('../services/userServices');
const EmailService = require('../services/emailService'); // Importamos la clase directamente
const loggerUtils = require('../utils/loggerUtils');
const authUtils = require('../utils/authUtils');

// Instanciamos el servicio de email
const emailService = new EmailService();

// ** GESTION DE CONTRASEÑAS **

// 1: CAMBIAR CONTRASEÑA
// Método para cambiar la contraseña del usuario autenticado
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
      const isNewPasswordValid = await userService.trackPasswordHistory(account.account_id, newPassword);
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
      await PasswordStatus.update(
        { last_change_date: new Date() },
        { where: { account_id: account.account_id } }
      );

      // Registrar la nueva contraseña en el historial
      await PasswordHistory.create({
        account_id: account.account_id,
        password_hash: newHashedPassword,
        change_date: new Date(),
      });

      // Revocar todas las sesiones activas
      await Session.update(
        { revoked: true },
        { where: { user_id: userId, revoked: false } }
      );

      // Enviar notificación de cambio de contraseña
      let emailResult = null;
      const user = await User.findByPk(userId);
      if (user) {
        emailResult = await emailService.sendPasswordChangeNotification(user.email);
        if (!emailResult.success) {
          loggerUtils.logUserActivity(userId, 'password_change_notification_failed', 'Fallo al enviar notificación de cambio de contraseña');
          console.error('Error al enviar notificación de cambio de contraseña:', emailResult.messageId || 'No se recibió información del error');
        }
      }

      // Registrar el cambio de contraseña exitoso
      loggerUtils.logUserActivity(userId, 'password_change', 'Contraseña actualizada exitosamente');

      res.status(200).json({
        message: 'Contraseña actualizada exitosamente.',
        ...(emailResult?.success ? { emailInfo: { messageId: emailResult.messageId } } : {}),
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al cambiar la contraseña', error: error.message });
    }
  },
];

// 2: RECUPERACIÓN DE CONTRASEÑA
// Método para iniciar el proceso de recuperación de contraseña
exports.initiatePasswordRecovery = async (req, res) => {
  const { email } = req.body;

  try {
    // Buscar al usuario por su correo
    const user = await User.findOne({ where: { email } });
    if (!user) {
      loggerUtils.logUserActivity(null, 'password_recovery_failed', `Usuario no encontrado para el correo: ${email}`);
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    loggerUtils.logUserActivity(user.user_id, 'iniciar recuperacion', 'paso 1');

    // Buscar la cuenta asociada al usuario
    const account = await Account.findOne({ where: { user_id: user.user_id } });
    if (!account) {
      loggerUtils.logUserActivity(user.user_id, 'password_recovery_failed', 'Cuenta no encontrada');
      return res.status(404).json({ message: 'Cuenta no encontrada.' });
    }

    loggerUtils.logUserActivity(user.user_id, 'iniciar recuperacion', 'paso 2');

    // Generar un token de recuperación
    const recoveryToken = authUtils.generateOTP();
    const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    loggerUtils.logUserActivity(user.user_id, 'iniciar recuperacion', 'paso 3');

    // Guardar el token en la tabla PasswordRecovery
    await PasswordRecovery.create({
      account_id: account.account_id,
      recovery_token: recoveryToken,
      token_expiration: expiration,
      attempts: 0,
      is_token_valid: true,
    });

    loggerUtils.logUserActivity(user.user_id, 'iniciar recuperacion', 'paso 4');

    // Enviar el token por correo electrónico
    const emailResult = await emailService.sendOTPEmail(user.email, recoveryToken);
    if (!emailResult.success) {
      loggerUtils.logUserActivity(user.user_id, 'password_recovery_email_failed', 'Fallo al enviar OTP de recuperación');
      return res.status(500).json({ 
        message: 'Error al enviar el código de recuperación.', 
        error: emailResult.messageId || 'No se recibió información del error' 
      });
    }

    res.status(200).json({
      message: 'Se ha enviado un código de recuperación a tu correo electrónico.',
      emailInfo: { messageId: emailResult.messageId },
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al iniciar el proceso de recuperación de contraseña.', error: error.message });
  }
};

// Método para verificar el código OTP para recuperación de contraseña
exports.verifyOTP = async (req, res) => {
  const { email, otp } = req.body;

  console.log(`Iniciando verificación de OTP para el email: ${email}`);

  try {
    // Buscar al usuario por su correo
    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log(`Usuario con email ${email} no encontrado.`);
      return res.status(404).json({ message: 'Usuario no encontrado.' });
    }

    console.log(`Usuario encontrado: ${user.user_id}`);

    // Buscar la cuenta asociada al usuario
    const account = await Account.findOne({ where: { user_id: user.user_id } });
    if (!account) {
      console.log(`Cuenta para el usuario ${user.user_id} no encontrada.`);
      return res.status(404).json({ message: 'Cuenta no encontrada.' });
    }

    console.log(`Cuenta encontrada: ${account.account_id}`);

    // Buscar el token de recuperación
    const recovery = await PasswordRecovery.findOne({
      where: {
        account_id: account.account_id,
        recovery_token: otp,
        is_token_valid: true,
      },
    });

    if (!recovery) {
      console.log(`Token de recuperación no válido para la cuenta ${account.account_id}.`);
      return res.status(400).json({ message: 'El código OTP no es válido.' });
    }

    console.log(`Token de recuperación encontrado: ${recovery.recovery_id}`);

    // Validar manualmente la fecha de expiración del token
    if (recovery.token_expiration < new Date()) {
      console.log(`Token de recuperación expirado para la cuenta ${account.account_id}.`);
      return res.status(400).json({ message: 'El código OTP ha expirado.' });
    }

    // Verificar si el OTP ingresado es correcto
    if (otp !== recovery.recovery_token) {
      // Incrementar el contador de intentos fallidos
      recovery.attempts += 1;
      await recovery.save();

      console.log(`Intento fallido #${recovery.attempts} para la cuenta ${account.account_id}.`);

      // Si los intentos fallidos son 3 o más, invalidar el token
      if (recovery.attempts >= 3) {
        recovery.is_token_valid = false;
        await recovery.save();

        console.log(`Límite de intentos alcanzado. Token invalidado para la cuenta ${account.account_id}.`);

        return res.status(400).json({
          message: 'Has alcanzado el límite de intentos fallidos. Solicita un nuevo código OTP.',
        });
      }

      return res.status(400).json({
        message: `Código OTP incorrecto. Intentos restantes: ${3 - recovery.attempts}.`,
      });
    }

    console.log(`OTP verificado correctamente para la cuenta ${account.account_id}.`);

    // Invalidar el token después de su uso
    recovery.is_token_valid = false;
    recovery.attempts = 0; // Reiniciar intentos
    await recovery.save();

    console.log(`Token invalidado y contador de intentos reiniciado para la cuenta ${account.account_id}.`);

    res.status(200).json({
      message: 'OTP verificado correctamente. Puedes proceder a cambiar tu contraseña.',
      status: 'success',
    });
  } catch (error) {
    console.error(`Error al verificar el código OTP: ${error.message}`);
    res.status(500).json({ message: 'Error al verificar el código OTP.', error: error.message });
  }
};

// Método para restablecer una contraseña
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
      await PasswordHistory.create({
        account_id: account.account_id,
        password_hash: newHashedPassword,
        change_date: new Date(),
      });

      // Revocar todas las sesiones activas
      await Session.update(
        { revoked: true },
        { where: { user_id: user.user_id, revoked: false } }
      );

      // Enviar notificación de cambio de contraseña
      const emailResult = await emailService.sendPasswordChangeNotification(user.email);
      if (!emailResult.success) {
        loggerUtils.logUserActivity(user.user_id, 'password_reset_notification_failed', 'Fallo al enviar notificación de cambio de contraseña');
        console.error('Error al enviar notificación de cambio de contraseña:', emailResult.messageId || 'No se recibió información del error');
      }

      // Registrar el cambio de contraseña exitoso
      loggerUtils.logUserActivity(user.user_id, 'password_reset', 'Contraseña restablecida exitosamente');

      res.status(200).json({
        message: 'Contraseña actualizada exitosamente.',
        ...(emailResult?.success ? { emailInfo: { messageId: emailResult.messageId } } : {}),
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al cambiar la contraseña.', error: error.message });
    }
  },
];

// 3: VERIFICAR SI LA CONTRASEÑA ESTÁ COMPROMETIDA
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
      message: 'La contraseña ha sido filtrada. Por favor, elige una más segura.',
    });
  } else {
    return res.json({
      status: 'safe',
      message: 'La contraseña no se encuentra en la lista de contraseñas filtradas.',
    });
  }
};