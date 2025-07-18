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
      model: 'users',
      key: 'user_id'
    },
    field: 'user_id'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    },
    field: 'product_id'
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'orders', key: 'order_id' },
    field: 'order_id'
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'rating',
    validate: { min: 1, max: 5 }
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
  tableName: 'reviews',
  timestamps: false,
  indexes: [
    { name: 'idx_user_id', fields: ['user_id'] },
    { name: 'idx_product_id', fields: ['product_id'] },
    { name: 'idx_order_id', fields: ['order_id'] },
    { name: 'idx_rating', fields: ['rating'] }
  ],
  hooks: {
    afterCreate: async (review) => {
      const product = await sequelize.models.Product.findByPk(review.product_id);
      const reviews = await sequelize.models.Review.findAll({
        where: { product_id: review.product_id }
      });
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
      await product.update({
        average_rating: avgRating,
        total_reviews: reviews.length
      });
    },
    afterUpdate: async (review) => {
      const product = await sequelize.models.Product.findByPk(review.product_id);
      const reviews = await sequelize.models.Review.findAll({
        where: { product_id: review.product_id }
      });
      const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
      await product.update({
        average_rating: avgRating,
        total_reviews: reviews.length
      });
    },
    afterDestroy: async (review) => {
      const product = await sequelize.models.Product.findByPk(review.product_id);
      const reviews = await sequelize.models.Review.findAll({
        where: { product_id: review.product_id }
      });
      const avgRating = reviews.length > 0 ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;
      await product.update({
        average_rating: avgRating,
        total_reviews: reviews.length
      });
    }
  }
});

module.exports = Review;