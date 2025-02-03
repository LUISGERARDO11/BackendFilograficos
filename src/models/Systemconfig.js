const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const SystemConfig = sequelize.define('SystemConfig', {
  config_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  jwt_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3600
  },
  email_verification_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 86400
  },
  otp_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900
  },
  session_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3600
  },
  cookie_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 3600
  },
  expiration_threshold_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900
  },
  max_failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5
  },
  max_blocks_in_n_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5
  },
  block_period_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30
  }
}, {
  tableName: 'systemconfig',
  timestamps: false
});

module.exports = SystemConfig;