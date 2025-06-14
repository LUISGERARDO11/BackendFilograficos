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
  active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  imagen_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  public_id: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  color_fondo: {
    type: DataTypes.STRING(10),
    allowNull: true
  }
}, {
  tableName: 'categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['name'], name: 'idx_category_name', unique: true }
  ]
});

module.exports = Category;