const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Category = sequelize.define('Category', {
  category_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    unique: true,
    allowNull: false
  },
  description: DataTypes.TEXT,
  active: { // 🔹 Agregar esta columna
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true // Por defecto, las categorías estarán activas
  }
}, {
  tableName: 'categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Category;
