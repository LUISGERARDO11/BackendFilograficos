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
      model: 'promotions', // Nombre de la tabla de promociones en inglés
      key: 'promotion_id'
    },
    field: 'promotion_id'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products', // Nombre de la tabla de productos en inglés
      key: 'product_id'
    },
    field: 'product_id'
  }
}, {
  tableName: 'promotion_products', // Nombre de la tabla en inglés
  timestamps: false // No se necesitan campos de timestamp adicionales
});

module.exports = PromotionProduct;