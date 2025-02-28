const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Review = sequelize.define('Review', {
  review_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'review_id'
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users', // Nombre de la tabla de usuarios en inglés
      key: 'user_id'
    },
    field: 'user_id'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products', // Nombre de la tabla de productos en inglés
      key: 'product_id'
    },
    field: 'product_id'
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'rating'
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'comment'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  }
}, {
  tableName: 'reviews', // Nombre de la tabla en inglés
  timestamps: false, // No se necesitan campos de timestamp adicionales
  indexes: [
    {
      name: 'idx_user_id', // Índice para user_id
      fields: ['user_id']
    },
    {
      name: 'idx_product_id', // Índice para product_id
      fields: ['product_id']
    },
    {
      name: 'idx_rating', // Índice para rating
      fields: ['rating']
    }
  ]
});

module.exports = Review;