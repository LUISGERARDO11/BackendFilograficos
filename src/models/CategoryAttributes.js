const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const CategoryAttributes = sequelize.define('CategoryAttributes', {
  category_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true, // Part of the composite primary key
    references: {
      model: 'categories', // Name of the table in your database
      key: 'category_id'  // Name of the column in the Categories table
    }
  },
  attribute_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    primaryKey: true, // Part of the composite primary key
    references: {
      model: 'product_attributes', // Name of the table in your database
      key: 'attribute_id'         // Name of the column in the ProductAttributes table
    }
  }
}, {
  tableName: 'category_attributes', // Exact name of the table in your database
  timestamps: false                 // No timestamps needed for this intermediate table
});

module.exports = CategoryAttributes;