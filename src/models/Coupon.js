const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Coupon = sequelize.define('Coupon', {
  coupon_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  promotion_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'promotions', key: 'promotion_id' }
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active'
  }
}, {
  tableName: 'coupons',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Coupon;