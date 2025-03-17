const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const CommunicationPreference = sequelize.define('CommunicationPreference', {
  preference_id: {
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
    },
    unique: true
  },
  methods: {
    type: DataTypes.JSON, // Cambiado de ARRAY a JSON
    allowNull: false,
    defaultValue: ['email']
  },
  categories: {
    type: DataTypes.JSON,
    defaultValue: {
      special_offers: false,
      event_reminders: false,
      news_updates: false,
      order_updates: false,
      urgent_orders: false,
      design_reviews: false,
      stock_alerts: false
    }
  }
}, {
  tableName: 'communication_preferences',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = CommunicationPreference;