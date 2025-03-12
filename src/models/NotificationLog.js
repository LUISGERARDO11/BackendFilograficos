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
  expires_at: { // Nuevo campo para la expiración
    type: DataTypes.DATE,
    allowNull: true
  },
  seen: { // Nuevo campo para marcar si fue vista
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'notifications_log',
  timestamps: true, // Habilitamos timestamps para usar createdAt y updatedAt automáticamente
  createdAt: 'created_at', // Usamos created_at como nombre del campo
  updatedAt: 'updated_at' // Añadimos updated_at para posibles actualizaciones futuras
});

module.exports = NotificationLog;