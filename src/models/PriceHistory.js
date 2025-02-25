const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const PriceHistory = sequelize.define('PriceHistory', {
  history_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'product_id'
    }
  },
  previous_price: {
    type: DataTypes.DECIMAL(10,2),
    allowNull: false
  },
  new_price: {
    type: DataTypes.DECIMAL(10,2),
    allowNull: false
  },
  change_type: {
    type: DataTypes.ENUM('manual', 'promotion', 'discount', 'adjustment'),
    allowNull: false
  },
  change_description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  changed_by: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'user_id'
    }
  },
  change_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'price_history',
  timestamps: false,
  indexes: [
    { fields: ['product_id'] },
    { fields: ['change_date'] }
  ]
});

module.exports = PriceHistory;
