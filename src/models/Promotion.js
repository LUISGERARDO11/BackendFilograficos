const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Promotion = sequelize.define('Promotion', {
  promotion_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: { // Nuevo campo para identificar la promoción fácilmente
    type: DataTypes.STRING(100),
    allowNull: false
  },
  promotion_type: {
    type: DataTypes.ENUM('quantity_discount', 'order_count_discount', 'unit_discount'), // Tipos genéricos
    allowNull: false
  },
  discount_value: {
    type: DataTypes.DECIMAL(5, 2), // Porcentaje o valor fijo (10% = 10.00)
    allowNull: false
  },
  min_quantity: { // Cantidad mínima de productos/unidades
    type: DataTypes.INTEGER,
    allowNull: true
  },
  min_order_count: { // Cantidad mínima de pedidos previos
    type: DataTypes.INTEGER,
    allowNull: true
  },
  min_unit_measure: { // Para metros (DTF UV)
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  applies_to: { // Qué afecta la promoción
    type: DataTypes.ENUM('specific_products', 'specific_categories', 'all'),
    allowNull: false
  },
  is_exclusive: { // No acumulable con otras promociones
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'user_id' }
  }
}, {
  tableName: 'promotions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Promotion;