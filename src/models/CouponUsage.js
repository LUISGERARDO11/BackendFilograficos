const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const CouponUsage = sequelize.define('CouponUsage', {
  usage_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'usage_id'
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
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // Nombre de la tabla de usuarios en inglés
      key: 'user_id'
    },
    field: 'user_id'
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders', // Nombre de la tabla de pedidos en inglés
      key: 'order_id'
    },
    field: 'order_id'
  },
  applied_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'applied_at'
  }
}, {
  tableName: 'coupon_usages', // Nombre de la tabla en inglés
  timestamps: false // No se necesitan campos de timestamp adicionales
});

module.exports = CouponUsage;