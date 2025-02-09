/* This code snippet is defining a Sequelize model for a "Session" entity in a Node.js application.
Here's a breakdown of what each part of the code is doing: */
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
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Session;
