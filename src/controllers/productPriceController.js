const { Op } = require('sequelize');
const { body, query, param, validationResult } = require('express-validator');
const { Product, ProductVariant, ProductImage, PriceHistory, Category, User } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Middleware de validación (sin cambios)
const validateGetAllVariants = [
  query('search').optional().trim().escape(),
  query('category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un entero positivo'),
  query('product_type')
    .optional()
    .isIn(['Existencia', 'semi_personalizado', 'personalizado'])
    .withMessage('El tipo de producto debe ser "Existencia", "semi_personalizado" o "personalizado"'),
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un entero positivo'),
  query('limit').optional().isInt({ min: 1 }).withMessage('El límite debe ser un entero positivo'),
  query('sortBy')
    .optional()
    .isIn(['sku', 'calculated_price', 'production_cost', 'profit_margin', 'product_name', 'updated_at'])
    .withMessage('El campo de ordenamiento debe ser "sku", "calculated_price", "production_cost", "profit_margin", "product_name" o "updated_at"'),
  query('sortOrder')
    .optional()
    .isIn(['ASC', 'DESC'])
    .withMessage('El orden debe ser "ASC" o "DESC"')
];

const validateGetVariantById = [
  param('id').isInt({ min: 1 }).withMessage('El ID de la variante debe ser un entero positivo')
];

const validateUpdateVariantPrice = [
  param('id').isInt({ min: 1 }).withMessage('El ID de la variante debe ser un entero positivo'),
  body('production_cost')
    .isFloat({ min: 0 })
    .withMessage('El costo de producción debe ser un número positivo'),
  body('profit_margin')
    .isFloat({ min: 0 })
    .withMessage('El margen de ganancia debe ser un número positivo')
];

const validateGetPriceHistory = [
  param('variant_id').isInt({ min: 1 }).withMessage('El ID de la variante debe ser un entero positivo')
];

// Validación para actualización en lote (uniforme)
const validateBatchUpdateVariantPrices = [
  body('variant_ids')
    .isArray({ min: 1 })
    .withMessage('Debe proporcionar al menos un ID de variante')
    .custom((value) => value.every(id => Number.isInteger(id) && id > 0))
    .withMessage('Todos los IDs de variantes deben ser enteros positivos'),
  body('production_cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El costo de producción debe ser un número positivo'),
  body('profit_margin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El margen de ganancia debe ser un número positivo'),
  body().custom((body) => {
    if (!body.production_cost && !body.profit_margin) {
      throw new Error('Debe proporcionar al menos un valor para actualizar: production_cost o profit_margin');
    }
    return true;
  })
];

// Nueva validación para actualización en lote individual
const validateBatchUpdateVariantPricesIndividual = [
  body('variants')
    .isArray({ min: 1 })
    .withMessage('Debe proporcionar al menos una variante para actualizar'),
  body('variants.*.variant_id')
    .isInt({ min: 1 })
    .withMessage('El ID de la variante debe ser un entero positivo'),
  body('variants.*.production_cost')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('El margen de ganancia debe ser un número positivo'),
  body('variants.*').custom((variant) => {
    if (!variant.production_cost && !variant.profit_margin) {
      throw new Error('Cada variante debe tener al menos un valor para actualizar: production_cost o profit_margin');
    }
    return true;
  })
];

// Métodos existentes (sin cambios)
exports.getAllVariants = [
  validateGetAllVariants,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const {
        search,
        category_id,
        product_type,
        page = 1,
        limit = 50,
        sortBy,
        sortOrder = 'DESC'
      } = req.query;

      // Filtros
      const where = {};
      const productWhere = { status: 'active' };

      if (search) {
        where[Op.or] = [
          { sku: { [Op.like]: `%${search}%` } },
          { '$Product.name$': { [Op.like]: `%${search}%` } }
        ];
        if (!isNaN(parseInt(search))) {
          productWhere.category_id = parseInt(search);
        }
      }

      if (category_id) {
        productWhere.category_id = parseInt(category_id);
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
          return res.status(404).json({ message: 'Categoría no encontrada' });
        }
      }

      if (product_type) {
        productWhere.product_type = product_type;
      }

      // Determinar ordenamiento
      let order = [];
      if (sortBy) {
        if (sortBy === 'product_name') {
          order = [[Product, 'name', sortOrder]];
        } else if (sortBy === 'updated_at') {
          // Ordenar por el change_date de PriceHistory directamente
          order = [[{ model: PriceHistory }, 'change_date', sortOrder]];
        } else {
          order = [[sortBy, sortOrder]];
        }
      } else {
        order = [['variant_id', 'DESC']];
      }

      // Consulta con paginación
      const { count, rows: variants } = await ProductVariant.findAndCountAll({
        where,
        include: [
          {
            model: Product,
            where: productWhere,
            attributes: ['name', 'description', 'category_id', 'product_type'],
            include: [
              {
                model: Category,
                attributes: ['name']
              }
            ]
          },
          {
            model: ProductImage,
            attributes: ['image_url'],
            where: { order: 1 },
            required: false
          },
          {
            model: PriceHistory,
            attributes: ['change_date'],
            order: [['change_date', 'DESC']], // Orden interno para obtener el más reciente
            limit: 1,
            required: false
          }
        ],
        attributes: ['variant_id', 'sku', 'production_cost', 'profit_margin', 'calculated_price'],
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit),
        order,
        subQuery: false
      });

      // Formatear respuesta
      const formattedVariants = variants.map(variant => {
        const lastPriceChange = variant.PriceHistories.length > 0 ? variant.PriceHistories[0].change_date : null;
        return {
          variant_id: variant.variant_id,
          product_name: variant.Product.name,
          description: variant.Product.description,
          sku: variant.sku,
          image_url: variant.ProductImages.length > 0 ? variant.ProductImages[0].image_url : null,
          calculated_price: parseFloat(variant.calculated_price).toFixed(2),
          production_cost: parseFloat(variant.production_cost).toFixed(2),
          profit_margin: parseFloat(variant.profit_margin).toFixed(2),
          category: variant.Product.Category ? variant.Product.Category.name : null,
          product_type: variant.Product.product_type,
          updated_at: lastPriceChange
            ? lastPriceChange.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Sin cambios de precio'
        };
      });

      res.status(200).json({
        message: 'Variantes obtenidas exitosamente',
        variants: formattedVariants,
        total: count,
        page: parseInt(page),
        pageSize: parseInt(limit)
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las variantes', error: error.message });
    }
  }
];

exports.getVariantById = [
  validateGetVariantById,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { id } = req.params;

      const variant = await ProductVariant.findByPk(id, {
        include: [
          {
            model: Product,
            where: { status: 'active' },
            attributes: ['name', 'description']
          },
          {
            model: ProductImage,
            attributes: ['image_url'],
            where: { order: 1 },
            required: false
          },
          {
            model: PriceHistory,
            attributes: ['change_date'],
            order: [['change_date', 'DESC']],
            limit: 1,
            required: false
          }
        ],
        attributes: ['variant_id', 'sku', 'production_cost', 'profit_margin', 'calculated_price']
      });

      if (!variant) {
        return res.status(404).json({ message: 'Variante no encontrada' });
      }

      const lastPriceChange = variant.PriceHistories.length > 0 ? variant.PriceHistories[0].change_date : null;
      const formattedVariant = {
        variant_id: variant.variant_id,
        product_name: variant.Product.name,
        description: variant.Product.description,
        sku: variant.sku,
        image_url: variant.ProductImages.length > 0 ? variant.ProductImages[0].image_url : null,
        calculated_price: parseFloat(variant.calculated_price).toFixed(2),
        production_cost: parseFloat(variant.production_cost).toFixed(2),
        profit_margin: parseFloat(variant.profit_margin).toFixed(2),
        updated_at: lastPriceChange
          ? lastPriceChange.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          : 'Sin cambios de precio'
      };

      res.status(200).json({
        message: 'Variante obtenida exitosamente',
        variant: formattedVariant
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener la variante', error: error.message });
    }
  }
];

// Método para obtener el historial de precios de una variante
exports.getPriceHistoryByVariantId = [
  validateGetPriceHistory,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { variant_id } = req.params;

      // Verificar si la variante existe
      const variant = await ProductVariant.findByPk(variant_id);
      if (!variant) {
        return res.status(404).json({ message: 'Variante no encontrada' });
      }

      // Obtener el historial de precios con información del usuario
      const priceHistory = await PriceHistory.findAll({
        where: { variant_id },
        attributes: [
          'history_id',
          'previous_production_cost',
          'new_production_cost',
          'previous_profit_margin',
          'new_profit_margin',
          'previous_calculated_price',
          'new_calculated_price',
          'change_type',
          'change_description',
          'change_date'
        ],
        order: [['change_date', 'DESC']],
        include: [
          {
            model: ProductVariant,
            attributes: ['sku'],
            include: [
              {
                model: Product,
                attributes: ['name']
              }
            ]
          },
          {
            model: User,
            attributes: ['user_id', 'name', 'email']
          }
        ]
      });

      if (!priceHistory.length) {
        return res.status(200).json({
          message: 'No se encontraron cambios de precio para esta variante',
          history: []
        });
      }

      // Formatear la respuesta
      const formattedHistory = priceHistory.map(entry => ({
        history_id: entry.history_id,
        product_name: entry.ProductVariant.Product.name,
        sku: entry.ProductVariant.sku,
        previous: {
          production_cost: parseFloat(entry.previous_production_cost).toFixed(2),
          profit_margin: parseFloat(entry.previous_profit_margin).toFixed(2),
          calculated_price: parseFloat(entry.previous_calculated_price).toFixed(2)
        },
        new: {
          production_cost: parseFloat(entry.new_production_cost).toFixed(2),
          profit_margin: parseFloat(entry.new_profit_margin).toFixed(2),
          calculated_price: parseFloat(entry.new_calculated_price).toFixed(2)
        },
        change_type: entry.change_type,
        change_description: entry.change_description || 'Sin descripción',
        change_date: entry.change_date.toLocaleDateString('es-MX', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        }),
        changed_by: {
          user_id: entry.User.user_id,
          name: entry.User.name,
          email: entry.User.email
        }
      }));

      res.status(200).json({
        message: 'Historial de precios obtenido exitosamente',
        history: formattedHistory
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener el historial de precios', error: error.message });
    }
  }
];

exports.updateVariantPrice = [
  validateUpdateVariantPrice,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { id } = req.params;
      const { production_cost, profit_margin } = req.body;
      const userId = req.user.user_id;

      const variant = await ProductVariant.findByPk(id, {
        include: [{ model: Product, attributes: ['name', 'status'] }]
      });

      if (!variant) {
        return res.status(404).json({ message: 'Variante no encontrada' });
      }

      if (variant.Product.status === 'inactive') {
        return res.status(400).json({ message: 'No se puede actualizar el precio de un producto inactivo' });
      }

      const newProductionCost = parseFloat(production_cost);
      const newProfitMargin = parseFloat(profit_margin);
      const newCalculatedPrice = newProductionCost * (1 + newProfitMargin / 100);

      // Registrar en PriceHistory con la nueva estructura
      await PriceHistory.create({
        variant_id: variant.variant_id,
        previous_production_cost: variant.production_cost,
        new_production_cost: newProductionCost,
        previous_profit_margin: variant.profit_margin,
        new_profit_margin: newProfitMargin,
        previous_calculated_price: variant.calculated_price,
        new_calculated_price: newCalculatedPrice,
        change_type: 'manual',
        changed_by: userId,
        change_date: new Date()
      });

      // Actualizar la variante
      await variant.update({
        production_cost: newProductionCost,
        profit_margin: newProfitMargin,
        calculated_price: newCalculatedPrice,
        updated_at: new Date()
      });

      // Registrar actividad
      loggerUtils.logUserActivity(
        userId,
        'update',
        `Precio actualizado para variante ${variant.sku} (${id}): $${newCalculatedPrice.toFixed(2)}`
      );

      const formattedVariant = {
        variant_id: variant.variant_id,
        product_name: variant.Product.name,
        sku: variant.sku,
        production_cost: newProductionCost.toFixed(2),
        profit_margin: newProfitMargin.toFixed(2),
        calculated_price: newCalculatedPrice.toFixed(2),
        updated_at: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
      };

      res.status(200).json({
        message: `Precio actualizado a $${newCalculatedPrice.toFixed(2)}`,
        variant: formattedVariant
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el precio', error: error.message });
    }
  }
];

// Método para actualización en lote (uniforme)
exports.batchUpdateVariantPrices = [
  validateBatchUpdateVariantPrices,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { variant_ids, production_cost, profit_margin } = req.body;
      const userId = req.user.user_id;

      const variants = await ProductVariant.findAll({
        where: { variant_id: { [Op.in]: variant_ids } },
        include: [{ model: Product, attributes: ['name', 'status'] }]
      });

      if (variants.length === 0) {
        return res.status(404).json({ message: 'No se encontraron variantes para los IDs proporcionados' });
      }

      const missingIds = variant_ids.filter(id => !variants.some(v => v.variant_id === id));
      if (missingIds.length > 0) {
        return res.status(404).json({
          message: `Las siguientes variantes no fueron encontradas: ${missingIds.join(', ')}`
        });
      }

      const inactiveProducts = variants.filter(v => v.Product.status === 'inactive');
      if (inactiveProducts.length > 0) {
        return res.status(400).json({
          message: `No se pueden actualizar precios de variantes de productos inactivos: ${inactiveProducts.map(v => v.sku).join(', ')}`
        });
      }

      const updatedVariants = [];
      const priceHistoryEntries = [];

      for (const variant of variants) {
        const newProductionCost = production_cost !== undefined ? parseFloat(production_cost) : variant.production_cost;
        const newProfitMargin = profit_margin !== undefined ? parseFloat(profit_margin) : variant.profit_margin;
        const newCalculatedPrice = newProductionCost * (1 + newProfitMargin / 100);

        if (
          newProductionCost !== parseFloat(variant.production_cost) ||
          newProfitMargin !== parseFloat(variant.profit_margin)
        ) {
          priceHistoryEntries.push({
            variant_id: variant.variant_id,
            previous_production_cost: variant.production_cost,
            new_production_cost: newProductionCost,
            previous_profit_margin: variant.profit_margin,
            new_profit_margin: newProfitMargin,
            previous_calculated_price: variant.calculated_price,
            new_calculated_price: newCalculatedPrice,
            change_type: 'batch_update',
            changed_by: userId,
            change_date: new Date()
          });

          await variant.update({
            production_cost: newProductionCost,
            profit_margin: newProfitMargin,
            calculated_price: newCalculatedPrice,
            updated_at: new Date()
          });

          updatedVariants.push({
            variant_id: variant.variant_id,
            product_name: variant.Product.name,
            sku: variant.sku,
            production_cost: newProductionCost.toFixed(2),
            profit_margin: newProfitMargin.toFixed(2),
            calculated_price: newCalculatedPrice.toFixed(2),
            updated_at: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          });

          loggerUtils.logUserActivity(
            userId,
            'batch_update',
            `Precio actualizado en lote para variante ${variant.sku} (${variant.variant_id}): $${newCalculatedPrice.toFixed(2)}`
          );
        } else {
          updatedVariants.push({
            variant_id: variant.variant_id,
            product_name: variant.Product.name,
            sku: variant.sku,
            production_cost: variant.production_cost.toFixed(2),
            profit_margin: variant.profit_margin.toFixed(2),
            calculated_price: variant.calculated_price.toFixed(2),
            updated_at: variant.updated_at.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          });
        }
      }

      if (priceHistoryEntries.length > 0) {
        await PriceHistory.bulkCreate(priceHistoryEntries);
      }

      res.status(200).json({
        message: `Precios actualizados exitosamente para ${priceHistoryEntries.length} variantes`,
        variants: updatedVariants
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar los precios en lote', error: error.message });
    }
  }
];

// Nuevo método para actualización en lote individual
exports.batchUpdateVariantPricesIndividual = [
  validateBatchUpdateVariantPricesIndividual,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { variants } = req.body; // Array de objetos: [{variant_id, production_cost?, profit_margin?}, ...]
      const userId = req.user.user_id;

      const variantIds = variants.map(v => v.variant_id);
      const dbVariants = await ProductVariant.findAll({
        where: { variant_id: { [Op.in]: variantIds } },
        include: [{ model: Product, attributes: ['name', 'status'] }]
      });

      if (dbVariants.length === 0) {
        return res.status(404).json({ message: 'No se encontraron variantes para los IDs proporcionados' });
      }

      const missingIds = variantIds.filter(id => !dbVariants.some(v => v.variant_id === id));
      if (missingIds.length > 0) {
        return res.status(404).json({
          message: `Las siguientes variantes no fueron encontradas: ${missingIds.join(', ')}`
        });
      }

      const inactiveProducts = dbVariants.filter(v => v.Product.status === 'inactive');
      if (inactiveProducts.length > 0) {
        return res.status(400).json({
          message: `No se pueden actualizar precios de variantes de productos inactivos: ${inactiveProducts.map(v => v.sku).join(', ')}`
        });
      }

      const updatedVariants = [];
      const priceHistoryEntries = [];

      for (const variantData of variants) {
        const variant = dbVariants.find(v => v.variant_id === variantData.variant_id);
        const newProductionCost = variantData.production_cost !== undefined ? parseFloat(variantData.production_cost) : variant.production_cost;
        const newProfitMargin = variantData.profit_margin !== undefined ? parseFloat(variantData.profit_margin) : variant.profit_margin;
        const newCalculatedPrice = newProductionCost * (1 + newProfitMargin / 100);

        if (
          newProductionCost !== parseFloat(variant.production_cost) ||
          newProfitMargin !== parseFloat(variant.profit_margin)
        ) {
          priceHistoryEntries.push({
            variant_id: variant.variant_id,
            previous_production_cost: variant.production_cost,
            new_production_cost: newProductionCost,
            previous_profit_margin: variant.profit_margin,
            new_profit_margin: newProfitMargin,
            previous_calculated_price: variant.calculated_price,
            new_calculated_price: newCalculatedPrice,
            change_type: 'batch_update_individual',
            changed_by: userId,
            change_date: new Date()
          });

          await variant.update({
            production_cost: newProductionCost,
            profit_margin: newProfitMargin,
            calculated_price: newCalculatedPrice,
            updated_at: new Date()
          });

          updatedVariants.push({
            variant_id: variant.variant_id,
            product_name: variant.Product.name,
            sku: variant.sku,
            production_cost: newProductionCost.toFixed(2),
            profit_margin: newProfitMargin.toFixed(2),
            calculated_price: newCalculatedPrice.toFixed(2),
            updated_at: new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          });

          loggerUtils.logUserActivity(
            userId,
            'batch_update_individual',
            `Precio actualizado en lote individual para variante ${variant.sku} (${variant.variant_id}): $${newCalculatedPrice.toFixed(2)}`
          );
        } else {
          updatedVariants.push({
            variant_id: variant.variant_id,
            product_name: variant.Product.name,
            sku: variant.sku,
            production_cost: variant.production_cost.toFixed(2),
            profit_margin: variant.profit_margin.toFixed(2),
            calculated_price: variant.calculated_price.toFixed(2),
            updated_at: variant.updated_at.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
          });
        }
      }

      if (priceHistoryEntries.length > 0) {
        await PriceHistory.bulkCreate(priceHistoryEntries);
      }

      res.status(200).json({
        message: `Precios actualizados exitosamente para ${priceHistoryEntries.length} variantes`,
        variants: updatedVariants
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar los precios en lote individual', error: error.message });
    }
  }
];

module.exports = exports;