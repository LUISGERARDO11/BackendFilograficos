/* This JavaScript code snippet is a module that provides various authentication-related
functionalities for a Node.js application. */
require("dotenv").config();
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { Op } = require('sequelize');

// Modelos
const Config = require('../models/Systemconfig');
const { Account, FailedAttempt, User, PasswordStatus } = require('../models/Associations');
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

// Generar JWT
exports.generateJWT = async (user) => {
  const config = await Config.findOne({ where: { config_id: 1 } });
  const jwtLifetime = config?.jwt_lifetime || 900; // 15 minutos por defecto en segundos

  return jwt.sign(
    { user_id: user.user_id, user_type: user.user_type },
    process.env.JWT_SECRET,
    { expiresIn: jwtLifetime } // Usar jwt_lifetime directamente en segundos
  );
};

// Verificar JWT
exports.verifyJWT = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { success: true, data: decoded };
  } catch (error) {
    return { success: false, message: "Token inválido o expirado" };
  }
};

// Manejar intentos fallidos
exports.handleFailedAttempt = async (user_id, ip) => {
  const transaction = await sequelize.transaction();
  try {
    const [config, account] = await Promise.all([
      Config.findOne({ transaction }),
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

    const MAX_FAILED_ATTEMPTS = config?.max_failed_login_attempts || 5;
    const MAX_BLOCKS_IN_N_DAYS = config?.max_blocks_in_n_days || 5;
    const BLOCK_PERIOD_DAYS = config?.block_period_days || 30;

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