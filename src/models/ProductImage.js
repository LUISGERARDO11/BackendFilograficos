const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductImage = sequelize.define('ProductImage', {
  image_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants',
      key: 'variant_id'
    }
  },
  image_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  public_id: { // Nuevo campo para almacenar el public_id de Cloudinary
    type: DataTypes.STRING(255),
    allowNull: false
  },
  order: {
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