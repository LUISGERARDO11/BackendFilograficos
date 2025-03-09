const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductVariant = sequelize.define('ProductVariant', {
  variant_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    }
  },
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  production_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  profit_margin: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  calculated_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  stock_threshold: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    allowNull: false
  },
  last_stock_added_at: {
    type: DataTypes.DATE,
    allowNull: true, // Puede ser NULL si nunca se ha agregado stock
    defaultValue: null // NULL por defecto al crear la variante
  }
}, {
  tableName: 'product_variants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ProductVariant;