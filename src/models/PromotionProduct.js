const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PromotionProduct = sequelize.define('PromotionProduct', {
  promotion_product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'promotion_product_id'
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'promotions',
      key: 'promotion_id'
    },
    field: 'promotion_id'
  },
  variant_id: { // Cambiado de product_id a variant_id
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants', // Referencia a product_variants
      key: 'variant_id'
    },
    field: 'variant_id'
  }
}, {
  tableName: 'promotion_products',
  timestamps: false
});

module.exports = PromotionProduct;