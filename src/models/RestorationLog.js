const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const RestorationLog = sequelize.define('RestorationLog', {
  restoration_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  backup_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'backup_logs', // Relación con la tabla de respaldos
      key: 'backup_id'
    }
  },
  restoration_datetime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Fecha y hora actual por defecto
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('successful', 'failed'), // Estado de la restauración
    allowNull: false
  },
  error_message: {
    type: DataTypes.TEXT, // Detalle del error si la restauración falla
    allowNull: true
  },
  performed_by: {
    type: DataTypes.INTEGER, // ID del usuario que realizó la restauración
    allowNull: false,
    references: {
      model: 'users', // Relación con la tabla de usuarios
      key: 'user_id'
    }
  }
}, {
  tableName: 'restoration_logs', // Nombre de la tabla en la base de datos
  timestamps: false, // No usar createdAt y updatedAt
  indexes: [
    {
      fields: ['backup_id'] // Índice para el ID del respaldo
    },
    {
      fields: ['restoration_datetime'] // Índice para la fecha y hora de la restauración
    },
    {
      fields: ['status'] // Índice para el estado de la restauración
    }
  ]
});

module.exports = RestorationLog;