/* Nuevo modelo para almacenar tokens JWT revocados */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const RevokedToken = sequelize.define('RevokedToken', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  token: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  revokedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  }
}, {
  tableName: 'revoked_tokens',
  timestamps: false
});

module.exports = RevokedToken;