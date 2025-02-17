const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const SupportInquiry = sequelize.define('SupportInquiry', {
  inquiry_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  user_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  user_email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: { isEmail: true }
  },
  subject: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'resolved', 'closed'),
    defaultValue: 'pending'
  },
  contact_channel: {
    type: DataTypes.ENUM('form', 'whatsapp', 'email', 'phone'),
    defaultValue: 'form'
  },
  response_channel: {
    type: DataTypes.ENUM('email', 'whatsapp', 'phone'),
    allowNull: true
  }
}, {
  tableName: 'support_inquiries',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

module.exports = SupportInquiry;
