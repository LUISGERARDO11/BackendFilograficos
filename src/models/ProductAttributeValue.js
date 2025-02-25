const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ProductAttributeValue = sequelize.define('ProductAttributeValue', {
  attribute_value_id: {
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
  attribute_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_attributes',
      key: 'attribute_id'
    }
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: false
  }
}, {
  tableName: 'product_attribute_values',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = ProductAttributeValue;
