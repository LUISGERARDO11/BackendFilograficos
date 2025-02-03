const PasswordHistory = require("../models/Passwordhistory");
const authService = require("../services/authService");

exports.trackPasswordHistory = async (accountId, currentPasswordHash, newPassword) => {
  try {
    // 1. Verificar contraseña anterior
    const historyRecords = await PasswordHistory.findAll({
      where: { account_id: accountId },
      attributes: ['password_hash', 'change_date'],
      order: [['change_date', 'DESC']]
    });

    // Verificar contra todas las contraseñas históricas
    for (const record of historyRecords) {
      const isMatch = await authService.verifyPassword(
        newPassword,
        record.password_hash
      );
      
      if (isMatch) {
        return {
          success: false,
          message: "No puedes reutilizar una contraseña anterior"
        };
      }
    }

    // 2. Registrar nueva entrada en el historial
    await PasswordHistory.create({
      account_id: accountId,
      password_hash: currentPasswordHash,
      change_date: new Date()
    });

    return { success: true };

  } catch (error) {
    console.error('Error en trackPasswordHistory:', error);
    throw new Error(`Error gestionando historial de contraseñas: ${error.message}`);
  }
};