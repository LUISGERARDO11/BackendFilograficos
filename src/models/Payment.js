const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Payment = sequelize.define('Payment', {
  payment_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders', // Relación con la tabla de pedidos
      key: 'order_id'
    }
  },
  payment_method: {
    type: DataTypes.ENUM('bank_transfer'), // Método de pago
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2), // Monto del pago
    allowNull: false
  },
  receipt_url: {
    type: DataTypes.STRING(255), // URL del comprobante
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'validated', 'failed'), // Estado del pago
    defaultValue: 'pending'
  },
  attempts: {
    type: DataTypes.INTEGER, // Número de intentos
    defaultValue: 0
  }
}, {
  tableName: 'payments', // Nombre de la tabla en la base de datos
  timestamps: true, // Sequelize manejará automáticamente createdAt y updatedAt
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['order_id'] // Índice para el ID del pedido
    },
    {
      fields: ['status'] // Índice para el estado del pago
    }
  ]
});

module.exports = Payment;