/* This code snippet is defining a Sequelize model for a "Session" entity in a Node.js application.
Here's a breakdown of what each part of the code is doing: */
/* This code snippet defines a Sequelize model for a "Session" entity in a Node.js application, 
used to manage user sessions, including tokens for authentication and refresh tokens for Alexa Account Linking. */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Session = sequelize.define('Session', {
  session_id: {
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
  token: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  refresh_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  last_activity: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  expiration: {
    type: DataTypes.DATE,
    allowNull: false
  },
  ip: {
    type: DataTypes.STRING(45),
    allowNull: false
  },
  browser: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  revoked: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'sessions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['token'], name: 'idx_sessions_token' }, // Para búsquedas por token
    { fields: ['last_activity'], name: 'idx_sessions_last_activity' }, // Para verificar inactividad
    { fields: ['user_id', 'revoked'], name: 'idx_sessions_user_id_revoked' }, // Para contar sesiones activas por usuario
    { fields: ['refresh_token'], name: 'idx_sessions_refresh_token' } // Para búsquedas por refresh_token (Alexa)
  ]
});

module.exports = Session;