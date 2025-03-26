const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');
const loggerUtils = require('../utils/loggerUtils');
const { Product, ProductVariant, ProductImage } = require('../models/Associations');

const promotionService = new PromotionService();

// Validaciones para getAllPromotions (sin 'status')
const validateGetAllPromotions = [
    query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
    query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
    query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "promotion_id:ASC,start_date:DESC").'),
    query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.')
];

// Validaciones para createPromotion
const validateCreatePromotion = [
    body('name').notEmpty().withMessage('El nombre de la promoción es obligatorio'),
    body('promotion_type').isIn(['quantity_discount', 'order_count_discount', 'unit_discount']).withMessage('Tipo de promoción inválido'),
    body('discount_value').isFloat({ min: 0, max: 100 }).withMessage('El valor de descuento debe estar entre 0 y 100'),
    body('min_quantity').optional().isInt({ min: 1 }).withMessage('La cantidad mínima debe ser un entero mayor o igual a 1'),
    body('min_order_count').optional().isInt({ min: 1 }).withMessage('El conteo mínimo de pedidos debe ser un entero mayor o igual a 1'),
    body('min_unit_measure').optional().isFloat({ min: 0 }).withMessage('La medida mínima debe ser un número mayor o igual a 0'),
    body('applies_to').isIn(['specific_products', 'specific_categories', 'all']).withMessage('El campo "applies_to" debe ser "specific_products", "specific_categories" o "all"'),
    body('is_exclusive').optional().isBoolean().withMessage('El campo "is_exclusive" debe ser un booleano'),
    body('start_date').isISO8601().withMessage('La fecha de inicio debe ser una fecha válida en formato ISO8601'),
    body('end_date').isISO8601().withMessage('La fecha de fin debe ser una fecha válida en formato ISO8601'),
    body('variantIds').optional().isArray().withMessage('variantIds debe ser un arreglo'),
    body('categoryIds').optional().isArray().withMessage('categoryIds debe ser un arreglo'),
];

// Validaciones para los parámetros de búsqueda
const validateGetAllVariants = [
    query('search').optional().trim().escape(),
];

// Obtener todas las variantes con información básica
exports.getAllVariants = [
    validateGetAllVariants,
    async (req, res) => {
      try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
        }
  
        const { search } = req.query;
  
        // Filtros
        const variantWhere = { is_deleted: false }; // Solo variantes no eliminadas
        const productWhere = { status: 'active' }; // Solo productos activos
  
        if (search) {
          variantWhere[Op.or] = [
            { sku: { [Op.like]: `%${search}%` } },
          ];
          productWhere[Op.or] = [
            { name: { [Op.like]: `%${search}%` } },
          ];
        }
  
        // Consulta principal
        const variants = await ProductVariant.findAll({
          where: variantWhere,
          attributes: ['variant_id', 'sku'],
          include: [
            {
              model: Product,
              attributes: ['name'],
              where: productWhere,
              required: true
            },
            {
              model: ProductImage,
              attributes: ['image_url'],
              where: { order: 1 }, // Solo la primera imagen
              required: false // Para que devuelva variantes aunque no tengan imagen
            }
          ],
          order: [['variant_id', 'ASC']]
        });
  
        // Formatear la respuesta
        const formattedVariants = variants.map(variant => ({
          variant_id: variant.variant_id,
          sku: variant.sku,
          product_name: variant.Product ? variant.Product.name : null,
          image_url: variant.ProductImages.length > 0 ? variant.ProductImages[0].image_url : null
        }));
  
        res.status(200).json({
          message: 'Variantes obtenidas exitosamente',
          variants: formattedVariants,
          total: formattedVariants.length
        });
  
      } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener las variantes', error: error.message });
      }
    }
];

exports.createPromotion = [
    validateCreatePromotion,
    async (req, res) => {
        try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
        }

        const {
            name,
            promotion_type,
            discount_value,
            min_quantity,
            min_order_count,
            min_unit_measure,
            applies_to,
            is_exclusive = true,
            start_date,
            end_date,
            variantIds = [],
            categoryIds = []
        } = req.body;

        const created_by = req.user.user_id;

        if (!created_by) {
            return res.status(401).json({ message: 'No se pudo identificar al usuario autenticado' });
        }

        const promotionData = {
            name,
            promotion_type,
            discount_value,
            min_quantity,
            min_order_count,
            min_unit_measure,
            applies_to,
            is_exclusive,
            start_date,
            end_date,
            created_by,
            status: 'active',
            variantIds,
            categoryIds
        };

        const newPromotion = await promotionService.createPromotion(promotionData);

        res.status(201).json({
            message: 'Promoción creada exitosamente',
            promotion: newPromotion
        });
      } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al crear la promoción', error: error.message });
      }
    }
];

// Obtener todas las promociones activas
exports.getAllPromotions = [
  validateGetAllPromotions,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const {
        search,
        page: pageParam = 1,
        pageSize: pageSizeParam = 10,
        sort
      } = req.query;

      const page = parseInt(pageParam);
      const pageSize = parseInt(pageSizeParam);

      if (page < 1 || pageSize < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos' });
      }

      // Filtros (solo activas por defecto)
      const where = { status: 'active' }; // Solo promociones activas

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } }, // Usar Op.like en lugar de Op.iLike
          { promotion_type: { [Op.like]: `%${search}%` } } // Usar Op.like en lugar de Op.iLike
        ];
        if (!isNaN(parseFloat(search))) {
          where[Op.or].push(
            { discount_value: { [Op.between]: [parseFloat(search) - 0.01, parseFloat(search) + 0.01] } }
          );
        }
      }

      // Ordenamiento
      let order = [['promotion_id', 'ASC']]; // Orden por defecto
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['promotion_id', 'start_date', 'end_date', 'discount_value', 'created_at'];
        const validDirections = ['ASC', 'DESC'];

        order = sortParams.map(([column, direction]) => {
          if (!validColumns.includes(column)) {
            throw new Error(`Columna de ordenamiento inválida: ${column}. Use: ${validColumns.join(', ')}`);
          }
          if (!direction || !validDirections.includes(direction.toUpperCase())) {
            throw new Error(`Dirección de ordenamiento inválida: ${direction}. Use: ASC o DESC`);
          }
          return [column, direction.toUpperCase()];
        });
      }

      const { count, rows: promotions } = await promotionService.getPromotions({
        where,
        order,
        page,
        pageSize
      });

      // Formatear respuesta con campos relevantes para el administrador
      const formattedPromotions = promotions.map(promo => ({
        promotion_id: promo.promotion_id,
        name: promo.name, // Nombre para identificar fácilmente
        promotion_type: promo.promotion_type,
        discount_value: promo.discount_value,
        applies_to: promo.applies_to,
        is_exclusive: promo.is_exclusive,
        start_date: promo.start_date,
        end_date: promo.end_date,
        created_by: promo.created_by, // Quién creó la promoción
        created_at: promo.created_at, // Fecha de creación
        updated_by: promo.updated_by, // Quién actualizó (si aplica)
        updated_at: promo.updated_at, // Fecha de última actualización
        product_variants_count: promo.ProductVariants ? promo.ProductVariants.length : 0, // Cantidad de variantes asociadas
        category_count: promo.Categories ? promo.Categories.length : 0 // Cantidad de categorías asociadas
      }));

      res.status(200).json({
        message: 'Promociones activas obtenidas exitosamente',
        promotions: formattedPromotions,
        total: count,
        page,
        pageSize
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener las promociones', error: error.message });
    }
  }
];

// Obtener una promoción por ID
exports.getPromotionById = async (req, res) => {
  const { id } = req.params;

  try {
    const promotion = await promotionService.getPromotionById(id);

    if (!promotion || promotion.status !== 'active') {
      return res.status(404).json({ message: 'Promoción no encontrada o inactiva' });
    }

    // Formatear respuesta con todos los datos insertados al crear
    const formattedPromotion = {
      promotion_id: promotion.promotion_id,
      name: promotion.name,
      promotion_type: promotion.promotion_type,
      discount_value: promotion.discount_value,
      min_quantity: promotion.min_quantity,
      min_order_count: promotion.min_order_count,
      min_unit_measure: promotion.min_unit_measure,
      applies_to: promotion.applies_to,
      is_exclusive: promotion.is_exclusive,
      start_date: promotion.start_date,
      end_date: promotion.end_date,
      status: promotion.status,
      created_by: promotion.created_by,
      created_at: promotion.created_at,
      updated_by: promotion.updated_by,
      updated_at: promotion.updated_at,
      // Incluir variantes si aplica
      variantIds: promotion.ProductVariants ? promotion.ProductVariants.map(v => ({
        variant_id: v.variant_id,
        sku: v.sku,
        product_name: v.product_name // Asumiendo que el modelo incluye esto, ajustar según tu DB
      })) : [],
      // Incluir categorías si aplica
      categoryIds: promotion.Categories ? promotion.Categories.map(c => ({
        category_id: c.category_id,
        name: c.name
      })) : []
    };

    res.status(200).json({
      message: 'Promoción obtenida exitosamente',
      promotion: formattedPromotion
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la promoción', error: error.message });
  }
};

// Actualizar una promoción
exports.updatePromotion = [
  // Validaciones
  body('name')
    .optional()
    .trim()
    .isLength({ min: 3, max: 100 })
    .withMessage('El nombre debe tener entre 3 y 100 caracteres.'),
  body('promotion_type')
    .optional()
    .isIn(['quantity_discount', 'order_count_discount', 'unit_discount'])
    .withMessage('El tipo de promoción debe ser "quantity_discount", "order_count_discount" o "unit_discount".'),
  body('discount_value')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('El valor del descuento debe estar entre 0 y 100.'),
  body('min_quantity')
    .optional()
    .if(body('promotion_type').equals('quantity_discount'))
    .isInt({ min: 1 })
    .withMessage('La cantidad mínima debe ser un entero mayor o igual a 1 para descuentos por cantidad.'),
  body('min_order_count')
    .optional()
    .if(body('promotion_type').equals('order_count_discount'))
    .isInt({ min: 1 })
    .withMessage('El conteo mínimo de órdenes debe ser un entero mayor o igual a 1 para descuentos por conteo de órdenes.'),
  body('min_unit_measure')
    .optional()
    .if(body('promotion_type').equals('unit_discount'))
    .isFloat({ min: 0 })
    .withMessage('La medida mínima debe ser un número mayor o igual a 0 para descuentos por unidad.'),
  body('applies_to')
    .optional()
    .isIn(['specific_products', 'specific_categories', 'all'])
    .withMessage('El campo "applies_to" debe ser "specific_products", "specific_categories" o "all".'),
  body('is_exclusive')
    .optional()
    .isBoolean()
    .withMessage('El campo "is_exclusive" debe ser un valor booleano.'),
  body('start_date')
    .optional()
    .isISO8601()
    .withMessage('La fecha de inicio debe ser una fecha válida en formato ISO 8601.'),
  body('end_date')
    .optional()
    .isISO8601()
    .withMessage('La fecha de fin debe ser una fecha válida en formato ISO 8601.')
    .custom((end_date, { req }) => {
      const start_date = req.body.start_date || req.body.existingStartDate; // Asumiendo que podrías enviar la fecha existente
      if (start_date && new Date(end_date) <= new Date(start_date)) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio.');
      }
      return true;
    }),
  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('El estado debe ser "active" o "inactive".'),
  body('variantIds')
    .optional()
    .isArray()
    .withMessage('variantIds debe ser un arreglo.')
    .if(body('applies_to').equals('specific_products'))
    .custom(variantIds => variantIds.length > 0)
    .withMessage('Debe haber al menos un variantId cuando applies_to es "specific_products".'),
  body('variantIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cada variantId debe ser un entero positivo.'),
  body('categoryIds')
    .optional()
    .isArray()
    .withMessage('categoryIds debe ser un arreglo.')
    .if(body('applies_to').equals('specific_categories'))
    .custom(categoryIds => categoryIds.length > 0)
    .withMessage('Debe haber al menos un categoryId cuando applies_to es "specific_categories".'),
  body('categoryIds.*')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Cada categoryId debe ser un entero positivo.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
    }

    const { id } = req.params;
    const { 
      name, 
      promotion_type, 
      discount_value, 
      min_quantity, 
      min_order_count, 
      min_unit_measure, 
      applies_to, 
      is_exclusive, 
      start_date, 
      end_date, 
      status, 
      variantIds, 
      categoryIds 
    } = req.body;

    try {
      // Datos a actualizar
      const promotionData = {
        name,
        promotion_type,
        discount_value,
        min_quantity,
        min_order_count,
        min_unit_measure,
        applies_to,
        is_exclusive,
        start_date,
        end_date,
        status,
        updated_by: req.user.user_id // Asumiendo que tienes el ID del usuario en req.user
      };

      const promotion = await promotionService.updatePromotion(
        id,
        promotionData,
        variantIds || [],
        categoryIds || []
      );

      if (!promotion) {
        return res.status(404).json({ message: 'Promoción no encontrada' });
      }

      loggerUtils.logUserActivity(req.user.user_id, 'update', `Promoción actualizada: ${id}`);
      res.status(200).json({ message: 'Promoción actualizada exitosamente', promotion });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la promoción', error: error.message });
    }
  }
];

// Eliminar una promoción (eliminación lógica)
exports.deletePromotion = async (req, res) => {
  const { id } = req.params;

  try {
    const result = await promotionService.deletePromotion(id);

    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Promoción desactivada: ${id}`);
    res.status(200).json(result);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al desactivar la promoción', error: error.message });
  }
};