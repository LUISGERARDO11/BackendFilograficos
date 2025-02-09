/* This JavaScript code snippet is defining a Sequelize model for an "Account" entity. Here's a
breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Account = sequelize.define('Account', {
  account_id: {
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
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  last_access: DataTypes.DATE,
  max_failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  }
}, {
  tableName: 'accounts',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Account;
