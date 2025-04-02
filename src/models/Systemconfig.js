/* This code snippet is defining a Sequelize model named `SystemConfig` that represents a table in a
database. Here's a breakdown of what the code is doing: */
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
    defaultValue: 900 // 15 minutos, alineado con session_lifetime
  },
  email_verification_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 86400 // 24 horas, sin cambios
  },
  otp_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900 // 15 minutos, sin cambios
  },
  session_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900 // 15 minutos para la duración base de la sesión
  },
  cookie_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900 // 15 minutos, alineado con jwt_lifetime
  },
  expiration_threshold_lifetime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 900 // Sin cambios, usado para otro propósito
  },
  max_inactivity_time: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 300 // 5 minutos de inactividad máxima
  },
  session_extension_threshold: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 300 // 5 minutos antes de expiration para extender la sesión
  },
  max_failed_login_attempts: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5 // Sin cambios
  },
  max_blocks_in_n_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5 // Sin cambios
  },
  block_period_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30 // Sin cambios
  },
  show_banners_to_users: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false // Sin cambios
  }
}, {
  tableName: 'systemconfig',
  timestamps: false
});

module.exports = SystemConfig;