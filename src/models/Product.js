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
    allowNull: false,
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
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
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
  production_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  profit_margin: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  calculated_price: DataTypes.DECIMAL(10, 2),
  on_promotion: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  average_rating: {
    type: DataTypes.DECIMAL(3, 2),
    defaultValue: 0
  },
  total_reviews: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('activo', 'inactivo'),
    defaultValue: 'activo'
  }
}, {
  tableName: 'products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Product;
