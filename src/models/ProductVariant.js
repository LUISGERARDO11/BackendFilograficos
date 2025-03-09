const { DataTypes } = require('sequelize');
const sequelize = require('../config/dataBase');
const NotificationManager = require('../services/notificationManager');

const notificationManager = new NotificationManager(); // Instanciar aquí

const ProductVariant = sequelize.define('ProductVariant', {
  variant_id: {
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
  sku: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  production_cost: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  profit_margin: {
    type: DataTypes.DECIMAL(5, 2),
    allowNull: false
  },
  calculated_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  stock_threshold: {
    type: DataTypes.INTEGER,
    defaultValue: 10,
    allowNull: false
  },
  last_stock_added_at: {
    type: DataTypes.DATE,
    allowNull: true,
    defaultValue: null
  }
}, {
  tableName: 'product_variants',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    afterUpdate: async (variant, options) => {
      const previousStock = variant._previousDataValues.stock;
      const currentStock = variant.dataValues.stock;
      const stockThreshold = variant.dataValues.stock_threshold;

      if (currentStock !== previousStock && currentStock < previousStock) {
        try {
          const product = await variant.getProduct({ attributes: ['name'] });
          const productName = product ? `${product.name} (SKU: ${variant.sku})` : `SKU: ${variant.sku}`;

          if (currentStock === 0) {
            await notificationManager.notifyOutOfStock(variant.variant_id, productName);
          } else if (currentStock <= stockThreshold) {
            await notificationManager.notifyLowStock(variant.variant_id, productName, currentStock);
          }
        } catch (error) {
          console.error('Error al enviar notificación de stock:', error.message);
          const { NotificationLog } = require('../models/Associations');
          await NotificationLog.create({
            user_id: null,
            type: 'system',
            title: 'Error en notificación de stock',
            message: `Fallo al notificar para variant_id: ${variant.variant_id}`,
            status: 'failed',
            error_message: error.message,
            created_at: new Date(),
          });
        }
      }
    }
  }
});

module.exports = ProductVariant;