const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const OrderDetail = sequelize.define('OrderDetail', {
  order_detail_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'order_detail_id'
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
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products', // Nombre de la tabla de productos en inglés
      key: 'product_id'
    },
    field: 'product_id'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'quantity'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'unit_price'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'subtotal'
  },
  discount_applied: {
    type: DataTypes.DECIMAL(10, 2), // Descuento aplicado
    defaultValue: 0.00
  },
}, {
    tableName: 'order_details',
    timestamps: false,
    indexes: [
      {
        name: 'idx_order_id', // Nombre del índice para order_id
        fields: ['order_id']
      },
      {
        name: 'idx_product_id', // Nombre del índice para product_id
        fields: ['product_id']
      }
    ]
  });

module.exports = OrderDetail;