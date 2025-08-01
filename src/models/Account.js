const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Account = sequelize.define('Account', {
  account_id: {
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
  password_hash: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  last_access: DataTypes.DATE,
  max_failed_login_attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 5
  },
  profile_picture_url: {
    type: DataTypes.STRING(255),
    allowNull: true, // La foto de perfil es opcional
    defaultValue: null
  },
  profile_picture_public_id: {
    type: DataTypes.STRING(255),
    allowNull: true, // El public_id es opcional
    defaultValue: null
  }
}, {
  tableName: 'accounts',
  timestamps: true, // Sequelize manejará automáticamente created_at y updated_at
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = Account;