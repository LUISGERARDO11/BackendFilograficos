const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Customization = sequelize.define('Customization', {
  customization_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    }
  },
  option_type: {
    type: DataTypes.ENUM('text', 'image', 'file'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  file_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  comments: {
    type: DataTypes.STRING(100),
    allowNull: true
  }
}, {
  tableName: 'customizations',
  timestamps: false
});

module.exports = Customization;
