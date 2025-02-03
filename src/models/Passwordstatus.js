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