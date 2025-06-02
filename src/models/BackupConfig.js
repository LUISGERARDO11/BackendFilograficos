const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const BackupConfig = sequelize.define('BackupConfig', {
  config_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  backup_type: {
    type: DataTypes.ENUM('full', 'differential', 'transactional'),
    allowNull: false,
    validate: {
      isIn: [['full', 'differential', 'transactional']]
    }
  },
  frequency: {
    type: DataTypes.ENUM('daily', 'weekly', 'hourly'),
    allowNull: false,
    validate: {
      isValidFrequency(value) {
        if (this.backup_type === 'full' && value !== 'weekly') {
          throw new Error('El respaldo completo debe tener frecuencia "weekly"');
        }
        if (this.backup_type === 'differential' && value !== 'daily') {
          throw new Error('El respaldo diferencial debe tener frecuencia "daily"');
        }
        if (this.backup_type === 'transactional' && value !== 'hourly') {
          throw new Error('El respaldo transaccional debe tener frecuencia "hourly"');
        }
      }
    }
  },
  data_types: {
    type: DataTypes.JSON,
    allowNull: false,
    validate: {
      isValidDataTypes(value) {
        let parsedValue = value;
        if (typeof value === 'string') {
          try {
            parsedValue = JSON.parse(value);
          } catch (error) {
            throw new Error('data_types debe ser un JSON válido');
          }
        }
        if (!Array.isArray(parsedValue) || parsedValue.length === 0) {
          throw new Error('data_types debe ser un array no vacío');
        }
        const validTypes = ['transactions', 'clients', 'configuration', 'full'];
        if (!parsedValue.every(type => validTypes.includes(type))) {
          throw new Error('Tipos de datos inválidos');
        }
        if (this.backup_type === 'transactional' && parsedValue.length !== 1 && parsedValue[0] !== 'transactions') {
          throw new Error('El respaldo transaccional solo puede incluir "transactions"');
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
  static_folder_id: {
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
        if (this.backup_type === 'transactional' && value !== '00:00:00') {
          throw new Error('El respaldo transaccional debe tener schedule_time "00:00:00"');
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
    },
    {
      fields: ['backup_type']
    }
  ]
});

module.exports = BackupConfig;