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
  }
}, {
  tableName: 'regulatorydocuments',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = RegulatoryDocument;
