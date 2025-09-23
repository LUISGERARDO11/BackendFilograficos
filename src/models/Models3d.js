// models/Models3d.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Models3d = sequelize.define('Models3d', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  product_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true // Aseguramos que el nombre del producto 3D sea único
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  model_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  preview_image_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'models3d',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['product_name'], name: 'idx_model_name', unique: true }
  ]
});

module.exports = Models3d;