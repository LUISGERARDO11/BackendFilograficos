const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Promotion = sequelize.define('Promotion', {
  promotion_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'promotion_id'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'products', // Nombre de la tabla de productos en inglés
      key: 'product_id'
    },
    field: 'product_id'
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'categories', // Nombre de la tabla de categorías en inglés
      key: 'category_id'
    },
    field: 'category_id'
  },
  promotion_type: {
    type: DataTypes.ENUM('offer', 'promotion', 'coupon'),
    allowNull: false,
    field: 'promotion_type'
  },
  coupon_code: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: true,
    field: 'coupon_code'
  },
  discount_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'discount_value'
  },
  min_purchase_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    field: 'min_purchase_amount'
  },
  min_quantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'min_quantity'
  },
  benefit_type: {
    type: DataTypes.ENUM('discount', 'free_shipping'),
    allowNull: false,
    field: 'benefit_type'
  },
  usage_limit: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'usage_limit'
  },
  usage_limit_per_customer: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'usage_limit_per_customer'
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'start_date'
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'end_date'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
    field: 'status'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // Nombre de la tabla de usuarios en inglés
      key: 'user_id'
    },
    field: 'created_by'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'promotions', // Nombre de la tabla en inglés
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_coupon_code', // Índice único para el código de cupón
      unique: true,
      fields: ['coupon_code']
    },
    {
      name: 'idx_start_date', // Índice para la fecha de inicio
      fields: ['start_date']
    },
    {
      name: 'idx_end_date', // Índice para la fecha de fin
      fields: ['end_date']
    },
    {
      name: 'idx_status', // Índice para el estado
      fields: ['status']
    }
  ]
});

module.exports = Promotion;