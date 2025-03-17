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
  public_id: { // Nuevo campo para almacenar el public_id de Cloudinary
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
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  }
}, {
  tableName: 'banners',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      fields: ['is_active'],
      name: 'idx_is_active'
    },
    {
      fields: ['order'],
      name: 'idx_order'
    }
  ]
});

module.exports = Banner;