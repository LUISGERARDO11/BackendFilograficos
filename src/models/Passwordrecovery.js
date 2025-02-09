/* This code snippet is defining a Sequelize model for a table named `PasswordRecovery` in a database.
Here's a breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PasswordRecovery = sequelize.define('PasswordRecovery', {
  recovery_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  account_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'accounts',
      key: 'account_id'
    }
  },
  recovery_token: DataTypes.STRING(255),
  token_expiration: DataTypes.DATE,
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_token_valid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'passwordrecovery',
  timestamps: false
});

module.exports = PasswordRecovery;