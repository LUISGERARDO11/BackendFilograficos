const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const RegulatoryDocument = sequelize.define('RegulatoryDocument', {
  document_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  title: {
    type: DataTypes.ENUM('Política de privacidad', 'Términos y condiciones', 'Deslinde legal'),
    allowNull: false
  },
  effective_date: DataTypes.DATEONLY,
  current_version: DataTypes.STRING(50),
  deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  tableName: 'regulatorydocuments',
  timestamps: false
});

module.exports = RegulatoryDocument;