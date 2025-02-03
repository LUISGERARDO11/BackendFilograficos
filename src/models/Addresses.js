const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Address = sequelize.define('Address', {
  address_id: {
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
  street: DataTypes.STRING(255),
  city: DataTypes.STRING(100),
  state: DataTypes.STRING(100),
  postal_code: DataTypes.STRING(10),
  is_primary: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'addresses',
  timestamps: false
});

module.exports = Address;