const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Banner = sequelize.define('Banner', {
  banner_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  image_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  cta_text: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  cta_link: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'), 
    defaultValue: 'active' 
  },
  start_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  end_date: {
    type: DataTypes.DATE,
    allowNull: false
  }
}, {
  tableName: 'banners',
  timestamps: true, // Sequelize manejará automáticamente createdAt y updatedAt
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['status']
    },
    {
      fields: ['start_date']
    },
    {
      fields: ['end_date']
    }
  ]
});

module.exports = Banner;