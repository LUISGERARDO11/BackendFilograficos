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
  //HAILIE
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'product_variants',
      key: 'variant_id'
    },
    field: 'variant_id'
  },
  customization_option_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'customization_options',
      key: 'option_id'
    },
    field: 'customization_option_id'
  },
  //
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
    field: 'subtotal'
  }
}, {
  tableName: 'cart_details',
  timestamps: false,
  hooks: {
    beforeSave: (cartDetail) => {
      // Calcular el subtotal automáticamente antes de guardar
      cartDetail.subtotal = cartDetail.quantity * cartDetail.unit_price;
    }
  }
});

module.exports = CartDetail;