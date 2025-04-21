const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const BackupConfig = sequelize.define('BackupConfig', {
  config_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'monthly'),
    allowNull: false
  },
  data_types: {
    type: DataTypes.JSON,
    allowNull: false,
    validate: {
      isValidDataTypes(value) {
        let parsedValue = value;
        // Si el valor es un string (caso de actualización desde la DB), parsearlo
        if (typeof value === 'string') {
          try {
            parsedValue = JSON.parse(value);
          } catch (error) {
            throw new Error('data_types debe ser un JSON válido');
          }
        }
        // Validar que sea un array no vacío
        if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
          throw new Error('data_types debe ser un array no vacío');
        }
        // Validar los tipos permitidos
        const validTypes = ['transactions', 'clients', 'configuration', 'full'];
        if (!parsedValue.every(type => validTypes.includes(type))) {
          throw new Error('Tipos de datos inválidos');
        }
      }
    }
  },
  storage_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [['google_drive']]
    }
  },
  refresh_token: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  folder_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  schedule_time: {
    type: DataTypes.TIME,
    allowNull: false,
    validate: {
      isValidTime(value) {
        const timeRegex = /^([0-1][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]$/;
        if (!timeRegex.test(value)) {
          throw new Error('Formato de hora inválido (HH:mm:ss)');
        }
      }
    }
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  }
}, {
  tableName: 'backup_config',
  timestamps: true,
  indexes: [
    {
      fields: ['created_by']
    },
    {
      fields: ['storage_type']
    }
  ]
});

module.exports = BackupConfig;