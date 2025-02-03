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
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    allowNull: false
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    allowNull: false
  }
}, {
  tableName: 'accounts',
  timestamps: false
});

module.exports = Account;