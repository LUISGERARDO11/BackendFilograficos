const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PushSubscription = sequelize.define('PushSubscription', {
  subscription_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  endpoint: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  p256dh: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  auth: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'push_subscriptions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = PushSubscription;