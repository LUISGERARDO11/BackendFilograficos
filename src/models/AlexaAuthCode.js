const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const AlexaAuthCode = sequelize.define('AlexaAuthCode', {
  code: {
    type: DataTypes.STRING,
    primaryKey: true,
    allowNull: false,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id',
    },
  },
  redirect_uri: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  scopes: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  used: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
}, {
  tableName: 'alexa_auth_codes',
  timestamps: false,
});

module.exports = AlexaAuthCode;