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
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  type: {
    type: DataTypes.ENUM('push', 'email'),
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
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'notifications_log',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false // No necesitamos updated_at aquí, ya que no se actualiza después de creado
});

module.exports = NotificationLog;