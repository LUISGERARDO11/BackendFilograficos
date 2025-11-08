/* This code snippet is defining a Sequelize model for a User entity in a Node.js application. Here's a
breakdown of what each part of the code is doing: */
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
  // NUEVO CAMPO VIP
  vip_level: {
    type: DataTypes.ENUM('Bronce', 'Plata', 'Oro'),
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = User;