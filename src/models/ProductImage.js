const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductImage = sequelize.define('ProductImage', {
  id_imagen: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  id_producto: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    }
  },
  url_imagen: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  orden: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'product_images',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ProductImage;

