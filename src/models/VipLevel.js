const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const VipLevel = sequelize.define('VipLevel', {
  name: {
    type: DataTypes.ENUM('Bronce', 'Plata', 'Oro'),
    primaryKey: true,
    allowNull: false
  },
  min_orders: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  min_badges: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  maintenance_orders: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  benefits: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  }
}, {
  tableName: 'vip_levels',
  timestamps: false
});

module.exports = VipLevel;