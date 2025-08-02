const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Cart = sequelize.define('Cart', {
  cart_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', 
      key: 'user_id'
    }
  },
  status: {
    type: DataTypes.ENUM('active', 'abandoned', 'completed'),
    defaultValue: 'active',
    allowNull: false
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'promotions',
      key: 'promotion_id'
    },
    field: 'promotion_id'
  },
  coupon_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    references: {
      model: 'coupons',
      key: 'code'
    },
    field: 'coupon_code'
  },
  total_discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'total_discount'
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'total'
  },
  total_urgent_delivery_fee: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'total_urgent_delivery_fee'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'carts',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id', 'status']
    }
  ]
});

module.exports = Cart;