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
    defaultValue: true // Por defecto, las categorías estarán activas
  },
  imagen_url: { //  Campo para almacenar la URL de la imagen en Cloudinary
    type: DataTypes.STRING(255),
    allowNull: true // Opcional, permite categorías sin imagen
  },
  public_id: { // Nuevo campo para almacenar el public_id de Cloudinary
    type: DataTypes.STRING(255),
    allowNull: true
  },
  color_fondo: { // Campo para el color de fondo como fallback (en formato hexadecimal)
    type: DataTypes.STRING(10),
    allowNull: true // Opcional, permite categorías sin color definido
  }
}, {
  tableName: 'categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Category;