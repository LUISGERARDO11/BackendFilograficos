const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PromotionCategory = sequelize.define('PromotionCategory', {
  promotion_category_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'promotion_category_id'
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
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'categories', // Nombre de la tabla de categorías en inglés
      key: 'category_id'
    },
    field: 'category_id'
  }
}, {
  tableName: 'promotion_categories', // Nombre de la tabla en inglés
  timestamps: false // No se necesitan campos de timestamp adicionales
});

module.exports = PromotionCategory;