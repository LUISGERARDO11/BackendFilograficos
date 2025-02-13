/* This JavaScript code snippet is defining a Sequelize model for a table named `PasswordHistory` in a
database. Here's a breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PasswordHistory = sequelize.define('PasswordHistory', {
  history_id: {
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
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  change_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  }
}, {
  tableName: 'passwordhistory',
  timestamps: false
});

module.exports = PasswordHistory;