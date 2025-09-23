const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const BadgeCategory = sequelize.define('BadgeCategory', {
  badge_category_id: {
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
    allowNull: true,
    validate: {
      len: [0, 500]
    }
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'badge_categories',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['name'], name: 'idx_badge_category_name', unique: true },
    { fields: ['is_active'], name: 'idx_badge_category_is_active' },
    { fields: ['badge_category_id', 'is_active'], name: 'idx_badge_category_id_is_active' }
  ]
});

module.exports = BadgeCategory;