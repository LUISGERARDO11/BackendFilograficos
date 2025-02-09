/* This code snippet is defining a Sequelize model for a table named `DocumentVersion` in a database.
Here's a breakdown of what each part of the code is doing: */
const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const DocumentVersion = sequelize.define('DocumentVersion', {
  version_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  document_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'regulatorydocuments',
      key: 'document_id'
    }
  },
  version: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  deleted: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'documentversions',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = DocumentVersion;
