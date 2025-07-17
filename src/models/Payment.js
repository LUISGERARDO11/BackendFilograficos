const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');
//REGRESANDO 
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
      model: 'orders',
      key: 'order_id'
    }
  },
  payment_method: {
    type: DataTypes.ENUM('mercado_pago'),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  preference_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  mercado_pago_transaction_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'validated', 'failed'),
    defaultValue: 'pending'
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  tableName: 'payments',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['order_id'] },
    { fields: ['status'] }
  ]
});

module.exports = Payment;