/* This JavaScript code snippet is defining a Sequelize model for a FAQ category. Here's a breakdown of
what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const FaqCategory = sequelize.define('FaqCategory', {
  category_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'faq_categories',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = FaqCategory;
