/* This JavaScript code defines a function named `trackPasswordHistory` that is responsible for
tracking password history for a given account. Here's a breakdown of what the function does: */
const authService = require("../services/authService");
const { PasswordHistory } = require('../models/Associations')

exports.trackPasswordHistory = async (accountId, newPassword) => {
  try {
    // 1. Obtener todas las contraseñas históricas del usuario
    const historyRecords = await PasswordHistory.findAll({
      where: { account_id: accountId },
      attributes: ['password_hash'],
      order: [['change_date', 'DESC']]
    });

    // 2. Verificar si la nueva contraseña coincide con alguna de las contraseñas históricas
    for (const record of historyRecords) {
      const isMatch = await authService.verifyPassword(
        newPassword,
        record.password_hash
      );
      
      if (isMatch) {
        return false; // La contraseña ya ha sido utilizada
      }
    }

    // 3. Si no se encontró coincidencia, la contraseña es válida
    return true;

  } catch (error) {
    console.error('Error en trackPasswordHistory:', error);
    throw new Error(`Error gestionando historial de contraseñas: ${error.message}`);
  }
};