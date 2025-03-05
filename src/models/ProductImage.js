const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductImage = sequelize.define('ProductImage', {
  image_id: { // Cambiado de id_imagen a image_id para consistencia
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  variant_id: { // Cambiado de id_producto a variant_id
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants',
      key: 'variant_id'
    }
  },
  image_url: { // Cambiado de url_imagen a image_url para consistencia
    type: DataTypes.STRING(255),
    allowNull: false
  },
  order: { // Cambiado de orden a order para consistencia
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