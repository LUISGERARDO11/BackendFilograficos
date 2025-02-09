/* This JavaScript code snippet is defining a Sequelize model called `PasswordStatus` that represents a
table in a database. Here's a breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PasswordStatus = sequelize.define('PasswordStatus', {
  status_id: {
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
  requires_change: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  last_change_date: DataTypes.DATE
}, {
  tableName: 'passwordstatus',
  timestamps: false
});

module.exports = PasswordStatus;