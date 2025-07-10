/* This JavaScript code snippet is a module that provides various authentication-related
functionalities for a Node.js application. */
require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require('sequelize');
const { v4: uuidv4 } = require('uuid');

// Modelos
const { SystemConfig, Session, Account, FailedAttempt, User, PasswordStatus, AlexaAuthCode } = require('../models/Associations');
// Utilidades
const authUtils = require("../utils/authUtils");
const loggerUtils = require('../utils/loggerUtils');
const sequelize = require('../config/dataBase');

// Cifrar contraseña
exports.hashPassword = async (password) => {
  try {
    const salt = await bcrypt.genSalt(10);
    return await bcrypt.hash(password, salt);
  } catch (error) {
    throw new Error(`Error al hashear la contraseña: ${error.message}`);
  }
};

// Verificar contraseña
exports.verifyPassword = async (password, hashedPassword) => {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (error) {
    throw new Error(`Error al verificar la contraseña: ${error.message}`);
  }
};

// Obtener configuración del sistema
exports.getConfig = async () => {
  const config = await SystemConfig.findOne({ where: { config_id: 1 } });
  if (!config) throw new Error('Configuración del sistema no encontrada');
  return config;
};

// Generar JWT
exports.generateJWT = async (user) => {
  const config = await exports.getConfig();
  const jwtLifetime = config.jwt_lifetime; // En segundos (15 min = 900s)

  return jwt.sign(
    { user_id: user.user_id, user_type: user.user_type },
    process.env.JWT_SECRET,
    { expiresIn: jwtLifetime }
  );
};

// Generar JWT para Alexa (30 días)
exports.generateAlexaJWT = (user, scopes) => {
  return jwt.sign(
    {
      user_id: user.user_id,
      user_type: user.user_type,
      client: process.env.ALEXA_CLIENT_ID,
      scope: scopes
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }
  );
};

// Verificar JWT y sesión asociada
exports.verifyJWT = async (token) => {
  const secret = process.env.JWT_SECRET;
  try {
    const decoded = jwt.verify(token, secret);
    const session = await Session.findOne({
      where: {
        token,
        user_id: decoded.user_id,
        revoked: false,
        expiration: { [Op.gt]: new Date() }
      }
    });

    if (!session) {
      throw new Error('Sesión no encontrada o expirada');
    }

    return { success: true, data: decoded, session };
  } catch (error) {
    return { success: false, message: `Token inválido o expirado: ${error.message}` };
  }
};

// Crear una nueva sesión
exports.createSession = async (user, ip, browser) => {
  const config = await exports.getConfig();
  const token = browser === 'Alexa-Skill' ? exports.generateAlexaJWT(user, ['read:orders', 'write:orders']) : await exports.generateJWT(user);
  const expiration = new Date(Date.now() + (browser === 'Alexa-Skill' ? 30 * 24 * 60 * 60 * 1000 : config.session_lifetime * 1000));

  const session = await Session.create({
    user_id: user.user_id,
    token,
    ip,
    browser,
    expiration,
    last_activity: new Date()
  });

  return { token, session };
};

// Extender sesión si está cerca de expirar
exports.extendSession = async (session) => {
  const config = await exports.getConfig();
  const now = Date.now();
  const expirationTime = new Date(session.expiration).getTime();
  const timeToExpiration = (expirationTime - now) / 1000; // En segundos

  if (timeToExpiration < config.session_extension_threshold) {
    const user = await User.findByPk(session.user_id);
    const newToken = session.browser === 'Alexa-Skill' ? exports.generateAlexaJWT(user, ['read:orders', 'write:orders']) : await exports.generateJWT(user);
    const newExpiration = new Date(now + (session.browser === 'Alexa-Skill' ? 30 * 24 * 60 * 60 * 1000 : config.session_lifetime * 1000));

    await session.update({
      token: newToken,
      expiration: newExpiration,
      last_activity: new Date()
    });
    console.log(`Sesión extendida para user_id: ${session.user_id}, nueva expiration: ${newExpiration}`);
    return newToken;
  }

  // Actualizar last_activity si no se renueva el token
  await session.update({ last_activity: new Date() });
  return session.token;
};

// Revocar sesión
exports.revokeSession = async (token) => {
  const session = await Session.findOne({ where: { token, revoked: false } });
  if (session) {
    await session.update({ revoked: true });
  }
};

// Manejar intentos fallidos
exports.handleFailedAttempt = async (user_id, ip) => {
  const transaction = await sequelize.transaction();
  try {
    const [config, account] = await Promise.all([
      exports.getConfig(),
      Account.findOne({ 
        where: { user_id },
        include: [User],
        transaction
      })
    ]);

    if (!account?.User) {
      await transaction.rollback();
      return { locked: false, message: 'Cuenta no encontrada.' };
    }

    const MAX_FAILED_ATTEMPTS = config.max_failed_login_attempts;
    const MAX_BLOCKS_IN_N_DAYS = config.max_blocks_in_n_days;
    const BLOCK_PERIOD_DAYS = config.block_period_days;

    let failedAttempt = await FailedAttempt.findOne({
      where: { user_id, is_resolved: false },
      transaction
    });

    if (!failedAttempt) {
      failedAttempt = await FailedAttempt.create({
        user_id,
        attempt_date: new Date(),
        ip,
        attempts: 1,
        is_resolved: false
      }, { transaction });
    } else {
      failedAttempt = await failedAttempt.update({
        attempts: failedAttempt.attempts + 1,
        attempt_date: new Date()
      }, { transaction });
    }

    if (failedAttempt.attempts >= MAX_FAILED_ATTEMPTS) {
      // Actualizar estado de contraseña
      await PasswordStatus.update(
        { requires_change: true },
        { where: { account_id: account.account_id }, transaction }
      );

      // Actualizar estado de usuario
      await account.User.update(
        { status: 'bloqueado' },
        { transaction }
      );

      // Contar bloqueos recientes
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - BLOCK_PERIOD_DAYS);

      const blockCount = await FailedAttempt.count({
        where: {
          user_id,
          attempt_date: { [Op.gte]: cutoffDate }
        },
        transaction
      });

      if (blockCount >= MAX_BLOCKS_IN_N_DAYS) {
        await account.User.update(
          { status: 'bloqueado_permanente' },
          { transaction }
        );
        await transaction.commit();
        return { locked: true, message: 'Bloqueo permanente. Contacte soporte.' };
      }

      await transaction.commit();
      return { locked: true, message: 'Cuenta bloqueada temporalmente.' };
    }

    await transaction.commit();
    loggerUtils.logUserActivity(user_id, 'login_failed', `Intento fallido ${failedAttempt.attempts}/${MAX_FAILED_ATTEMPTS}`);
    return { locked: false, message: 'Intento fallido registrado.' };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Error en intentos fallidos: ${error.message}`);
  }
};

// Limpiar intentos fallidos
exports.clearFailedAttempts = async (user_id) => {
  await FailedAttempt.update(
    { is_resolved: true },
    { where: { user_id } }
  );
};

// Forzar rotación de contraseña
exports.forcePasswordRotation = async (accountId) => {
  const transaction = await sequelize.transaction();
  try {
    const account = await Account.findByPk(accountId, {
      include: [PasswordStatus],
      transaction
    });

    if (!account?.PasswordStatus) {
      throw new Error("Cuenta no encontrada");
    }

    const rotationStatus = authUtils.checkPasswordRotation(
      account.PasswordStatus.last_change_date
    );

    await transaction.commit();
    return rotationStatus;
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Error en rotación de contraseña: ${error.message}`);
  }
};

// Verificar si usuario está bloqueado
exports.isUserBlocked = async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) return { blocked: false, message: "Usuario no encontrado." };

  const blockedStatuses = ['bloqueado', 'bloqueado_permanente'];
  const isBlocked = blockedStatuses.includes(user.status);

  let message;
  if (user.status === 'bloqueado') {
    message = "Usuario bloqueado temporalmente.";
  } else if (user.status === 'bloqueado_permanente') {
    message = "Usuario bloqueado permanentemente.";
  } else {
    message = "Usuario activo.";
  }

  return { blocked: isBlocked, message };
};

// Funciones para Alexa Account Linking
exports.generateAlexaAuthCode = async (userId, redirectUri, scopes) => {
  const code = uuidv4();
  await AlexaAuthCode.create({
    code,
    user_id: userId,
    redirect_uri: redirectUri,
    scopes: scopes.join(' '),
    expires: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
    used: false
  });
  return code;
};

exports.validateAlexaAuthCode = async (code) => {
  const authCode = await AlexaAuthCode.findOne({
    where: { code, used: false, expires: { [Op.gt]: new Date() } }
  });
  return authCode;
};

exports.markAlexaAuthCodeUsed = async (code) => {
  await AlexaAuthCode.update({ used: true }, { where: { code } });
};

exports.createAlexaTokens = async (user, ip, browser, scopes) => {
  const accessToken = exports.generateAlexaJWT(user, scopes);
  const refreshToken = uuidv4();
  const expiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días
  const session = await Session.create({
    user_id: user.user_id,
    token: accessToken,
    refresh_token: refreshToken,
    ip,
    browser,
    expiration,
    last_activity: new Date()
  });
  return { accessToken, refreshToken, session };
};

exports.validateAlexaRefreshToken = async (refreshToken) => {
  const session = await Session.findOne({
    where: {
      refresh_token: refreshToken,
      revoked: false,
      expiration: { [Op.gt]: new Date() }
    }
  });
  if (!session) {
    return null;
  }
  const user = await User.findByPk(session.user_id);
  if (!user || user.user_type !== 'administrador') {
    return null;
  }
  const newAccessToken = exports.generateAlexaJWT(user, ['read:orders', 'write:orders']);
  const newExpiration = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await session.update({
    token: newAccessToken,
    expiration: newExpiration,
    last_activity: new Date()
  });
  return {
    accessToken: newAccessToken,
    refreshToken,
    scope: 'read:orders write:orders',
    user_id: user.user_id
  };
};