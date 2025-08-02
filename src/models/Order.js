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
  coupon_code: {
    type: DataTypes.STRING(50),
    allowNull: true,
    references: {
      model: 'coupons',
      key: 'code'
    },
    field: 'coupon_code'
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
    type: DataTypes.ENUM('pending', 'validated', 'failed', 'approved', 'rejected', 'in_process'),
    defaultValue: 'pending'
  },
  payment_method: {
    type: DataTypes.ENUM('mercado_pago'),
    allowNull: false
  },
  order_status: {
    type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered'),
    defaultValue: 'pending'
  },
  estimated_delivery_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  total_urgent_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  delivery_option: {
    type: DataTypes.ENUM('Entrega a Domicilio', 'Puntos de Entrega', 'Recoger en Tienda'),
    allowNull: true,
    defaultValue: null
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