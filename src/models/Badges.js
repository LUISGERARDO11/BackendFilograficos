const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Badge = sequelize.define('Badge', {
  badge_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  icon_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  badge_category_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'badge_categories',
      key: 'badge_category_id'
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'badges',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['name'], name: 'idx_badge_name', unique: true },
    { fields: ['badge_category_id'], name: 'idx_badge_category_id' },
    { fields: ['is_active'], name: 'idx_badge_is_active' }
  ]
});

module.exports = Badge;