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
      model: 'orders', // Nombre de la tabla de pedidos
      key: 'order_id'
    },
    field: 'order_id'
  },
  variant_id: { // Cambiado de product_id a variant_id
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants', // Referencia a la tabla de variantes
      key: 'variant_id'
    },
    field: 'variant_id'
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
  unit_measure: { // Añadido para soportar metros u otras unidades
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.00, // Por defecto 1 unidad
    allowNull: false
  },
  discount_applied: {
    type: DataTypes.DECIMAL(10, 2), // Descuento aplicado
    defaultValue: 0.00
  }
}, {
  tableName: 'order_details',
  timestamps: false,
  indexes: [
    {
      name: 'idx_order_id', // Índice para order_id
      fields: ['order_id']
    },
    {
      name: 'idx_variant_id', // Índice actualizado para variant_id
      fields: ['variant_id']
    }
  ]
});

module.exports = OrderDetail;