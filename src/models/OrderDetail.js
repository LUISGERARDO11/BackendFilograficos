const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');

const OrderDetail = sequelize.define('OrderDetail', {
  order_detail_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    allowNull: false,
    field: 'order_detail_id'
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'order_id'
    },
    field: 'order_id'
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
  unit_measure: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 1.00,
    field: 'unit_measure'
  },
  discount_applied: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'discount_applied'
  },
  is_urgent: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  additional_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0.00
  }
}, {
  tableName: 'order_details',
  timestamps: false,
  indexes: [
    {
      fields: ['order_id']
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
    beforeSave: (orderDetail) => {
      // Calcular el subtotal automáticamente antes de guardar
      orderDetail.subtotal = orderDetail.quantity * orderDetail.unit_price;
    }
  }
});

module.exports = OrderDetail;