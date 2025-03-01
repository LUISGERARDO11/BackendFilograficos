const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Collaborator = sequelize.define('Collaborator', {
  collaborator_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  collaborator_type: {
    type: DataTypes.ENUM('individual', 'marca'),
    allowNull: false
  },
  contact: {
    type: DataTypes.STRING(255),
    allowNull: true // O false si quieres hacerlo obligatorio
  },  
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  phone: DataTypes.STRING(15),
  logo: DataTypes.STRING(255),
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'collaborators',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Collaborator;
