const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const BackupFiles = sequelize.define('BackupFiles', {
  file_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  backup_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'backup_logs',
      key: 'backup_id'
    }
  },
  file_drive_id: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  file_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  file_size: {
    type: DataTypes.BIGINT,
    allowNull: false,
    validate: {
      min: 0
    }
  },
  checksum: {
    type: DataTypes.STRING(64),
    allowNull: false,
    validate: {
      len: [64, 64] // SHA-256 produce 64 caracteres
    }
  }
}, {
  tableName: 'backup_files',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
  indexes: [
    {
      fields: ['backup_id']
    },
    {
      fields: ['file_drive_id']
    }
  ]
});

module.exports = BackupFiles;