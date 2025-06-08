const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const Customization = sequelize.define('Customization', {
  customization_id: {
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
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'customization_options',
      key: 'option_id'
    },
    field: 'option_id'
  },
  cart_detail_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'cart_details',
      key: 'cart_detail_id'
    },
    field: 'cart_detail_id'
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'orders',
      key: 'order_id'
    }
  },
  option_type: {
    type: DataTypes.ENUM('text', 'image', 'file'),
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  file_url: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  comments: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('initial', 'revised', 'approved', 'rejected'),
    defaultValue: 'initial',
    allowNull: false
  },
  revision_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  }
}, {
  tableName: 'customizations',
  timestamps: false,
  indexes: [
    {
      fields: ['product_id']
    },
    {
      fields: ['option_id']
    },
    {
      fields: ['cart_detail_id']
    },
    {
      fields: ['order_id']
    }
  ]
});

module.exports = Customization;