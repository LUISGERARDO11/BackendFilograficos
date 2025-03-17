const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const NotificationLog = sequelize.define('NotificationLog', {
  notification_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  type: {
    type: DataTypes.ENUM('push', 'email', 'system'),
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('sent', 'failed', 'pending'),
    defaultValue: 'pending',
    allowNull: false
  },
  sent_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  error_message: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  seen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'notifications_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['expires_at'], // Índice en expires_at para optimizar consultas de expiración
      name: 'idx_expires_at'
    },
    {
      fields: ['seen'], // Índice en seen para optimizar consultas de estado visto
      name: 'idx_seen'
    }
  ]
});

module.exports = NotificationLog;