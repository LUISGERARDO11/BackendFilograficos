const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const UploadedFiles = sequelize.define('UploadedFiles', {
  file_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  customization_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customizations',
      key: 'customization_id'
    }
  },
  file_url: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  public_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  file_type: {
    type: DataTypes.ENUM('image', 'pdf', 'other'),
    allowNull: false
  },
  uploaded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'uploaded_files',
  timestamps: false
});

module.exports = UploadedFiles;