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
      model: 'promotions',
      key: 'promotion_id'
    },
    field: 'promotion_id'
  },
  coupon_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'coupons',
      key: 'coupon_id'
    },
    field: 'coupon_id'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    },
    field: 'user_id'
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'order_id'
    },
    field: 'order_id'
  },
  cart_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'carts',
      key: 'cart_id'
    },
    field: 'cart_id'
  },
  applied_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'applied_at'
  }
}, {
  tableName: 'coupon_usages',
  timestamps: false,
  indexes: [
    {
      fields: ['user_id', 'promotion_id']
    },
    {
      fields: ['coupon_id']
    }
  ]
});

module.exports = CouponUsage;