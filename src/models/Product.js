const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Product = sequelize.define('Product', {
  product_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  collaborator_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'collaborators',
      key: 'collaborator_id'
    }
  },
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'categories',
      key: 'category_id'
    }
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: DataTypes.TEXT,
  product_type: {
    type: DataTypes.ENUM('Existencia', 'semi_personalizado', 'personalizado'),
    allowNull: false
  },
  on_promotion: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  average_rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0
  },
  total_reviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Product;