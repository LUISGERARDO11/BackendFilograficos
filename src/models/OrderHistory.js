const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const OrderHistory = sequelize.define('OrderHistory', {
  history_id: {
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
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders', // Relación con la tabla de pedidos
      key: 'order_id'
    }
  },
  purchase_date: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW, // Fecha de compra (valor predeterminado: fecha y hora actual)
    allowNull: false
  },
  order_status: {
    type: DataTypes.ENUM('pending', 'processing', 'shipped', 'delivered', 'canceled'), // Estado del pedido
    defaultValue: 'pending'
  },
  total: {
    type: DataTypes.DECIMAL(10, 2), // Total del pedido
    allowNull: false
  }
}, {
  tableName: 'order_history', // Nombre de la tabla en la base de datos
  timestamps: false, // No usar createdAt y updatedAt
  indexes: [
    {
      fields: ['user_id'] // Índice para el ID del usuario
    },
    {
      fields: ['order_id'] // Índice para el ID del pedido
    },
    {
      fields: ['purchase_date'] // Índice para la fecha de compra
    }
  ]
});

module.exports = OrderHistory;