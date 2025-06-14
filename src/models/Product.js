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
    type: DataTypes.ENUM('Existencia', 'Personalizado'),
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
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['name'], name: 'idx_product_name' },
    { fields: [{ attribute: 'description', length: 512 }], name: 'idx_product_description' },
    { fields: ['status'], name: 'idx_product_status' },
    { fields: ['category_id'], name: 'idx_product_category_id' },
    { fields: ['collaborator_id'], name: 'idx_product_collaborator_id' },
    { fields: ['name', { attribute: 'description', length: 512 }], name: 'idx_product_search' }
  ]
});

module.exports = Product;