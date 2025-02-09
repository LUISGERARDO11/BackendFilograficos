/* This JavaScript code snippet is defining a Sequelize model for a FAQ (Frequently Asked Questions)
entity. Here's a breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Faq = sequelize.define('Faq', {
  faq_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'faq_categories',
      key: 'category_id'
    }
  },
  question: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  answer: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'faqs',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Faq;
