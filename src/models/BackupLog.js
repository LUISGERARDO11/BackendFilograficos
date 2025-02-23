const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const BackupLog = sequelize.define('BackupLog', {
  backup_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  backup_datetime: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Fecha y hora actual por defecto
    allowNull: false
  },
  data_type: {
    type: DataTypes.ENUM('transactions', 'clients', 'configuration', 'full'), // Tipo de datos respaldados
    allowNull: false
  },
  location: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  file_size: {
    type: DataTypes.DECIMAL(10, 2), // Tamaño del archivo en MB
    allowNull: true // Puede ser nulo si el respaldo falla
  },
  status: {
    type: DataTypes.ENUM('successful', 'failed'), // Estado del respaldo
    allowNull: false
  },
  error_message: {
    type: DataTypes.TEXT, // Detalle del error si el respaldo falla
    allowNull: true
  },
  performed_by: {
    type: DataTypes.INTEGER, // ID del usuario que realizó el respaldo
    allowNull: false,
    references: {
      model: 'users', // Relación con la tabla de usuarios
      key: 'user_id'
    }
  }
}, {
  tableName: 'backup_logs', // Nombre de la tabla en la base de datos
  timestamps: false, // No usar createdAt y updatedAt
  indexes: [
    {
      fields: ['backup_datetime'] // Índice para la fecha y hora del respaldo
    },
    {
      fields: ['status'] // Índice para el estado del respaldo
    }
  ]
});

module.exports = BackupLog;