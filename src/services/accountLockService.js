const { sequelize } = require('../config/dataBase');
const { User, Account,PasswordStatus } = require('../models/Associations')

// Bloquear cuenta manualmente
exports.lockAccount = async (user_id) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(user_id, { transaction });
    const account = await Account.findOne({ 
      where: { user_id },
      transaction
    });

    if (!account || !user) {
      throw new Error('Usuario o cuenta no encontrados');
    }

    // Actualizar estado en User
    await user.update({ status: 'bloqueado' }, { transaction });
    
    // Actualizar estado de contraseña
    await PasswordStatus.update(
      { requires_change: true },
      { 
        where: { account_id: account.account_id },
        transaction
      }
    );

    await transaction.commit();
    
    return { 
      locked: true, 
      message: "Cuenta bloqueada manualmente. Se requiere cambio de contraseña."
    };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Error al bloquear cuenta: ${error.message}`);
  }
};

// Desbloquear cuenta
exports.unblockAccount = async (user_id) => {
  const transaction = await sequelize.transaction();
  try {
    const user = await User.findByPk(user_id, { transaction });
    const account = await Account.findOne({ 
      where: { user_id },
      transaction
    });

    if (!account || !user) {
      throw new Error('Usuario o cuenta no encontrados');
    }

    // Restaurar estado en User
    await user.update({ status: 'activo' }, { transaction });
    
    // Restablecer estado de contraseña
    await PasswordStatus.update(
      { requires_change: false },
      { 
        where: { account_id: account.account_id },
        transaction
      }
    );

    // Opcional: Resetear contador de intentos fallidos
    await account.update({ 
      max_failed_login_attempts: 5 // Valor por defecto
    }, { transaction });

    await transaction.commit();
    
    return { 
      unlocked: true, 
      message: "Cuenta desbloqueada exitosamente." 
    };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Error al desbloquear cuenta: ${error.message}`);
  }
};