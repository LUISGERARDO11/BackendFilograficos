const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const { ProductVariant, Product, Category, ProductImage } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Función auxiliar para calcular stock_status
const getStockStatus = (stock, threshold) => {
  if (stock === 0) return 'out_of_stock';
  if (stock <= threshold) return 'low_stock';
  return 'in_stock';
};

// Método: Obtener variantes con paginación y filtrado por categoría y/o estado del stock
exports.getStockVariants = [
  // Validaciones
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo'),
  query('category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un número entero'),
  query('stock_status')
    .optional()
    .isIn(['in_stock', 'low_stock', 'out_of_stock'])
    .withMessage('El estado del stock debe ser "in_stock", "low_stock" o "out_of_stock"'),

  async (req, res) => {
    try {
      // Verificar errores de validación
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { page = 1, pageSize = 10, category_id, stock_status } = req.query;

      // Configurar filtros para Product
      const whereProduct = { status: 'active' };
      if (category_id) {
        whereProduct.category_id = parseInt(category_id, 10);
      }

      // Configurar filtros para ProductVariant según stock_status
      const whereVariant = {};
      if (stock_status) {
        switch (stock_status) {
          case 'out_of_stock':
            whereVariant.stock = 0;
            break;
          case 'low_stock':
            whereVariant.stock = {
              [Op.gt]: 0,
              [Op.lte]: ProductVariant.sequelize.col('stock_threshold')
            };
            break;
          case 'in_stock':
            whereVariant.stock = {
              [Op.gt]: ProductVariant.sequelize.col('stock_threshold')
            };
            break;
          default:
            break;
        }
      }

      // Consulta con paginación
      const { count, rows: variants } = await ProductVariant.findAndCountAll({
        where: whereVariant,
        include: [
          {
            model: Product,
            where: whereProduct,
            attributes: ['product_id', 'name', 'product_type', 'category_id'],
            include: [
              {
                model: Category,
                attributes: ['category_id', 'name'],
                required: false // LEFT JOIN para Category
              }
            ]
          },
          {
            model: ProductImage,
            attributes: ['image_url'],
            where: { order: 1 },
            required: false
          }
        ],
        attributes: ['variant_id', 'sku', 'stock', 'stock_threshold', 'updated_at'],
        limit: parseInt(pageSize),
        offset: (parseInt(page) - 1) * parseInt(pageSize),
        order: [['variant_id', 'ASC']],
        subQuery: false // Evitar subconsulta innecesaria
      });

      // Validar existencia de categoría si se proporcionó
      if (category_id) {
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
          return res.status(404).json({ message: 'Categoría no encontrada' });
        }
      }

      // Formatear respuesta
      const formattedVariants = variants.map(variant => ({
        variant_id: variant.variant_id,
        sku: variant.sku,
        product_name: variant.Product ? variant.Product.name : null,
        category_name: variant.Product && variant.Product.Category ? variant.Product.Category.name : null,
        product_type: variant.Product ? variant.Product.product_type : null,
        stock: variant.stock,
        stock_threshold: variant.stock_threshold,
        stock_status: getStockStatus(variant.stock, variant.stock_threshold),
        first_image: variant.ProductImages.length > 0 ? variant.ProductImages[0].image_url : null,
        last_updated: variant.updated_at
      }));

      res.status(200).json({
        message: 'Variantes obtenidas exitosamente',
        variants: formattedVariants,
        total: count,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las variantes', error: error.message });
    }
  }
];

// Método: Añadir/Actualizar stock y umbral de una variante
exports.updateStock = [
  // Validaciones
  body('variant_id').isInt({ min: 1 }).withMessage('El ID de la variante debe ser un número entero positivo'),
  body('stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero positivo'),
  body('stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo'),

  async (req, res) => {
    try {
      // Verificar errores de validación
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { variant_id, stock, stock_threshold } = req.body;

      // Buscar la variante con el producto incluido (incluyendo 'status')
      const variant = await ProductVariant.findByPk(variant_id, {
        include: [{ model: Product, attributes: ['name', 'status'] }]
      });
      if (!variant) {
        return res.status(404).json({ message: 'Variante no encontrada' });
      }

      // Verificar que el producto esté activo
      if (variant.Product && variant.Product.status === 'inactive') {
        return res.status(400).json({ message: 'No se puede actualizar el stock de un producto inactivo' });
      }

      // Preparar datos para actualización
      const updateData = { stock: parseInt(stock) };
      if (stock_threshold !== undefined) {
        updateData.stock_threshold = parseInt(stock_threshold);
      }

      // Actualizar la variante
      await variant.update(updateData);

      // Registrar actividad
      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'update',
        `Stock actualizado para variante ${variant.sku} (${variant_id}): ${stock} unidades`
      );

      // Respuesta con datos actualizados
      res.status(200).json({
        message: 'Stock actualizado exitosamente',
        variant: {
          variant_id: variant.variant_id,
          sku: variant.sku,
          product_name: variant.Product ? variant.Product.name : null,
          stock: variant.stock,
          stock_threshold: variant.stock_threshold,
          stock_status: getStockStatus(variant.stock, variant.stock_threshold),
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