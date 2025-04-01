const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Company = sequelize.define('Company', {
  company_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false
  },
  page_title: DataTypes.STRING(255),
  logo: DataTypes.STRING(255),
  slogan: DataTypes.STRING(255),
  address_street: DataTypes.STRING(255),
  address_city: DataTypes.STRING(100),
  address_state: DataTypes.STRING(100),
  address_postal_code: DataTypes.STRING(10),
  address_country: DataTypes.STRING(100),
  phone_number: DataTypes.STRING(15),
  phone_extension: DataTypes.STRING(10),
  email: {
    type: DataTypes.STRING(255),
    unique: true,
    allowNull: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'company',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Company;