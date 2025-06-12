const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Order = sequelize.define('Order', {
  order_id: {
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
  address_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'addresses',
      key: 'address_id'
    }
  },
  total: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  discount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  shipping_cost: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'validated', 'failed'),
    defaultValue: 'pending'
  },
  payment_method: {
    type: DataTypes.ENUM('bank_transfer_oxxo', 'bank_transfer_bbva', 'bank_transfer', 'paypal', 'stripe'),
    defaultValue: 'bank_transfer',
    allowNull: true
  },
  order_status: {
    type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered'),
    defaultValue: 'pending'
  },
  is_urgent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'orders',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['address_id'] },
    { fields: ['order_status'] }
  ]
});

module.exports = Order;