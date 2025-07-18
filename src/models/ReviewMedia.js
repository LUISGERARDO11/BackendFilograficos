const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const ReviewMedia = sequelize.define('ReviewMedia', {
  media_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'media_id'
  },
  review_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'reviews',
      key: 'review_id'
    },
    field: 'review_id'
  },
  url: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'url',
    validate: {
      isUrl: true // Validar que sea una URL válida
    }
  },
  public_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'public_id'
  },
  media_type: {
    type: DataTypes.ENUM('image', 'video'),
    allowNull: false,
    defaultValue: 'image',
    field: 'media_type'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'review_media',
  timestamps: false,
  indexes: [
    { name: 'idx_review_id', fields: ['review_id'] }
  ]
});

module.exports = ReviewMedia;