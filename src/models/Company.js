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
  facebook: DataTypes.STRING(255),
  twitter: DataTypes.STRING(255),
  linkedin: DataTypes.STRING(255),
  instagram: DataTypes.STRING(255),
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    allowNull: false
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: sequelize.literal('CURRENT_TIMESTAMP'),
    allowNull: false
  }
}, {
  tableName: 'company',
  timestamps: false
});

module.exports = Company;