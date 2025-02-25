const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const CustomizationOption = sequelize.define('CustomizationOption', {
  option_id: {
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
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  tableName: 'customization_options',
  timestamps: false
});

module.exports = CustomizationOption;
