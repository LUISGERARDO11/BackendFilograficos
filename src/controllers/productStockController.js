const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const { ProductVariant, Product, Category, ProductImage } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Función auxiliar para calcular stock_status (sin cambios)
const getStockStatus = (stock, threshold, lastStockAddedAt) => {
  if (stock > threshold) return 'in_stock';
  if (stock > 0 && stock <= threshold) return 'low_stock';
  if (stock === 0) {
    return lastStockAddedAt ? 'out_of_stock' : 'no_stock';
  }
  return 'unknown';
};

// Método: Obtener variantes con paginación y filtrado
exports.getStockVariants = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo'),
  query('category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número entero'),
  query('stock_status')
    .optional()
    .isIn(['in_stock', 'low_stock', 'out_of_stock', 'no_stock'])
    .withMessage('El estado del stock debe ser "in_stock", "low_stock", "out_of_stock" o "no_stock"'),

  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { page = 1, pageSize = 10, category_id, stock_status } = req.query;

      const whereProduct = { status: 'active' };
      if (category_id) whereProduct.category_id = Number(category_id);

      const whereVariant = {};
      if (stock_status) {
        switch (stock_status) {
          case 'in_stock':
            whereVariant.stock = { [Op.gt]: ProductVariant.sequelize.col('stock_threshold') };
            break;
          case 'low_stock':
            whereVariant.stock = {
              [Op.gt]: 0,
              [Op.lte]: ProductVariant.sequelize.col('stock_threshold')
            };
            break;
          case 'out_of_stock':
            whereVariant.stock = 0;
            whereVariant.last_stock_added_at = { [Op.ne]: null };
            break;
          case 'no_stock':
            whereVariant.stock = 0;
            whereVariant.last_stock_added_at = null;
            break;
        }
      }

      const { count, rows: variants } = await ProductVariant.findAndCountAll({
        where: whereVariant,
        include: [
          {
            model: Product,
            where: whereProduct,
            attributes: ['product_id', 'name', 'product_type', 'category_id'],
            include: [{ model: Category, attributes: ['category_id', 'name'], required: false }]
          },
          {
            model: ProductImage,
            attributes: ['image_url'],
            where: { order: 1 },
            required: false
          }
        ],
        attributes: ['variant_id', 'sku', 'stock', 'stock_threshold', 'last_stock_added_at', 'updated_at'],
        limit: Number(pageSize),
        offset: (Number(page) - 1) * Number(pageSize),
        order: [['updated_at', 'DESC']],
        subQuery: false
      });

      if (category_id && !(await Category.findByPk(category_id))) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      const formattedVariants = variants.map(variant => ({
        variant_id: variant.variant_id,
        sku: variant.sku,
        product_name: variant.Product?.name ?? null,
        category_name: variant.Product?.Category?.name ?? null,
        product_type: variant.Product?.product_type ?? null,
        stock: variant.stock,
        stock_threshold: variant.stock_threshold,
        stock_status: getStockStatus(variant.stock, variant.stock_threshold, variant.last_stock_added_at),
        last_stock_added_at: variant.last_stock_added_at,
        first_image: variant.ProductImages?.[0]?.image_url ?? null,
        last_updated: variant.updated_at
      }));

      res.status(200).json({
        message: 'Variantes obtenidas exitosamente',
        variants: formattedVariants,
        total: count,
        page: Number(page),
        pageSize: Number(pageSize)
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las variantes', error: error.message });
    }
  }
];

// Método: Añadir/Actualizar stock y umbral
exports.updateStock = [
  body('variant_id').isInt({ min: 1 }).withMessage('El ID de la variante debe ser un número entero positivo'),
  body('stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero positivo'),
  body('stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo'),

  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { variant_id, stock, stock_threshold } = req.body;

      const variant = await ProductVariant.findByPk(variant_id, {
        include: [{ model: Product, attributes: ['name', 'status'] }]
      });

      if (!variant) {
        return res.status(404).json({ message: 'Variante no encontrada' });
      }

      if (variant.Product?.status === 'inactive') {
        return res.status(400).json({ message: 'No se puede actualizar el stock de un producto inactivo' });
      }

      const updateData = { stock: Number(stock) };
      if (stock_threshold !== undefined) updateData.stock_threshold = Number(stock_threshold);
      if (Number(stock) > variant.stock) updateData.last_stock_added_at = new Date();

      await variant.update(updateData);

      loggerUtils.logUserActivity(
        req.user?.user_id ?? 'system',
        'update',
        `Stock actualizado para variante ${variant.sku} (${variant_id}): ${stock} unidades`
      );

      res.status(200).json({
        message: 'Stock actualizado exitosamente',
        variant: {
          variant_id: variant.variant_id,
          sku: variant.sku,
          product_name: variant.Product?.name ?? null,
          stock: variant.stock,
          stock_threshold: variant.stock_threshold,
          stock_status: getStockStatus(variant.stock, variant.stock_threshold, variant.last_stock_added_at),
          last_stock_added_at: variant.last_stock_added_at,
          last_updated: variant.updated_at
        }
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el stock', error: error.message });
    }
  }
];

module.exports = exports;