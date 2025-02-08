const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const EmailTemplate = sequelize.define('EmailTemplate', {
  template_id: {
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
  email_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'emailtypes', // Nombre de la tabla referenciada
      key: 'email_type_id' // Columna referenciada
    }
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  html_content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  text_content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  variables: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: [] // Valor predeterminado como array vacío
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // Nombre de la tabla referenciada
      key: 'user_id'  // Columna referenciada
    }
  },
  updated_by: {
    type: DataTypes.INTEGER,
    allowNull: true, // Permitir NULL para updated_by
    references: {
      model: 'users', // Nombre de la tabla referenciada
      key: 'user_id'  // Columna referenciada
    }
  }
}, {
  tableName: 'emailtemplates', // Nombre de la tabla en la base de datos
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = EmailTemplate;
