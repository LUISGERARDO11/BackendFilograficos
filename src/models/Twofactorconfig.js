const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const TwoFactorConfig = sequelize.define('TwoFactorConfig', {
  config_id: {
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
  mfa_type: {
    type: DataTypes.ENUM('OTP', 'SMS'),
    defaultValue: 'OTP'
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  code: DataTypes.STRING(255),
  code_expires: DataTypes.DATE,
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  is_valid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'twofactorconfig',
  timestamps: false,
  indexes: [
    {
      fields: ['code_expires']
    }
  ]
});

module.exports = TwoFactorConfig;