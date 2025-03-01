const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductAttribute = sequelize.define('ProductAttribute', {
  attribute_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  attribute_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  data_type: {
    type: DataTypes.ENUM('texto', 'numero', 'boolean', 'lista'),
    allowNull: false
  },
  allowed_values: DataTypes.TEXT,
  is_deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'product_attributes',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ProductAttribute;
