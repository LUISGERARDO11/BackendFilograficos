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
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['google_drive']] // Por ahora, solo Google Drive
    }
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
      model: 'users',
      key: 'user_id'
    }
  }
}, {
  tableName: 'backup_logs',
  timestamps: false,
  indexes: [
    {
      fields: ['backup_datetime']
    },
    {
      fields: ['status']
    },
    {
      fields: ['performed_by']
    }
  ]
});

module.exports = BackupLog;