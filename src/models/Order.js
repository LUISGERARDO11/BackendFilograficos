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
      model: 'users', // Relación con la tabla de usuarios
      key: 'user_id'
    }
  },
  total: {
    type: DataTypes.DECIMAL(10, 2), // Total original
    allowNull: false
  },
  shipping_cost: {
    type: DataTypes.DECIMAL(10, 2), // Costo de envío
    defaultValue: 0.00
  },
  payment_status: {
    type: DataTypes.ENUM('pending', 'validated', 'failed'), // Estado del pago
    defaultValue: 'pending'
  },
  payment_method: {
    type: DataTypes.ENUM('bank_transfer'), // Método de pago
    defaultValue: 'bank_transfer'
  },
  order_status: {
    type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered'), // Estado del pedido
    defaultValue: 'pending'
  }
}, {
  tableName: 'orders', // Nombre de la tabla en la base de datos
  timestamps: true, // Sequelize manejará automáticamente createdAt y updatedAt
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['user_id'] // Índice para el ID del usuario
    },
    {
      fields: ['order_status'] // Índice para el estado del pedido
    }
  ]
});

module.exports = Order;