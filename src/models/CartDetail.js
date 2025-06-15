const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const CartDetail = sequelize.define('CartDetail', {
  cart_detail_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'cart_detail_id'
  },
  cart_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'carts',
      key: 'cart_id'
    },
    field: 'cart_id'
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
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants',
      key: 'variant_id'
    },
    field: 'variant_id'
  },
  option_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customization_options',
      key: 'option_id'
    },
    field: 'option_id'
  },
  customization_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customizations',
      key: 'customization_id'
    },
    field: 'customization_id'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'quantity'
  },
  unit_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'unit_price'
  },
  subtotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    field: 'subtotal'
  },
  discount_applied: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'discount_applied'
  },
  unit_measure: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 1.00,
    field: 'unit_measure'
  },
  is_urgent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'cart_details',
  timestamps: false,
  freezeTableName: true,
  indexes: [
    {
      fields: ['cart_id']
    },
    {
      fields: ['variant_id']
    },
    {
      fields: ['option_id']
    },
    {
      fields: ['customization_id']
    }
  ],
  hooks: {
    beforeSave: (cartDetail) => {
      // Calcular el subtotal automáticamente antes de guardar
      cartDetail.subtotal = cartDetail.quantity * cartDetail.unit_price;
    }
  }
});

module.exports = CartDetail;