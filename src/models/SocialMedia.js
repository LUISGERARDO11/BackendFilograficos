const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const SocialMedia = sequelize.define('SocialMedia', {
  social_media_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  company_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'company',
      key: 'company_id'
    }
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false // Ejemplo: "Facebook", "Twitter", "LinkedIn", etc.
  },
  link: {
    type: DataTypes.STRING(255),
    allowNull: false // El enlace a la red social
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'social_media',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SocialMedia;