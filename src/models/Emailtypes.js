/* This code snippet is defining a Sequelize model for an `EmailType` entity. Here's a breakdown of
what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const EmailType = sequelize.define('EmailType', {
  email_type_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  token: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: DataTypes.TEXT,
  required_variables: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [] // Valor predeterminado como array vacío
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  }
}, {
  tableName: 'emailtypes',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = EmailType;
