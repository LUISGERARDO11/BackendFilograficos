const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Promotion = sequelize.define('Promotion', {
  promotion_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  coupon_type: {
    type: DataTypes.ENUM('percentage_discount', 'fixed_discount', 'free_shipping'),
    allowNull: false
  },
  discount_value: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  max_uses: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_uses_per_user: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  min_order_value: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  free_shipping_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  applies_to: {
    type: DataTypes.ENUM('specific_products', 'specific_categories', 'all', 'cluster'),
    allowNull: false
  },
  is_exclusive: {
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
  },
  cluster_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  }
}, {
  tableName: 'promotions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Promotion;