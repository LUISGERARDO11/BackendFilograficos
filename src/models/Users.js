const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const User = sequelize.define('User', {
  user_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    validate: { isEmail: true }
  },
  phone: {
    type: DataTypes.STRING(15),
    allowNull: false,
    unique: true,
    validate: { is: /^[0-9+]+$/ }
  },
  user_type: {
    type: DataTypes.ENUM('cliente', 'administrador'),
    defaultValue: 'cliente'
  },
  status: {
    type: DataTypes.ENUM('activo', 'bloqueado', 'pendiente', 'bloqueado_permanente'),
    defaultValue: 'pendiente'
  },
  mfa_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  email_verification_token: DataTypes.STRING(255),
  email_verification_expiration: DataTypes.DATE,
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
  tableName: 'users',
  timestamps: false,
});

module.exports = User;