const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');
const loggerUtils = require('../utils/loggerUtils');
const { Product, ProductVariant, ProductImage, Cart, CartDetail, CouponUsage } = require('../models/Associations');

const promotionService = new PromotionService();

// Validaciones para getAllPromotions
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

// Validaciones para applyPromotion
const validateApplyPromotion = [
  body('promotion_id').isInt({ min: 1 }).withMessage('El promotion_id debe ser un entero positivo'),
];

// Validaciones para getAllVariants
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
      const variantWhere = { is_deleted: false };
      const productWhere = { status: 'active' };

      if (search) {
        variantWhere[Op.or] = [{ sku: { [Op.like]: `%${search}%` } }];
        productWhere[Op.or] = [{ name: { [Op.like]: `%${search}%` } }];
      }

      const variants = await ProductVariant.findAll({
        where: variantWhere,
        attributes: ['variant_id', 'sku'],
        include: [
          { model: Product, attributes: ['name'], where: productWhere, required: true },
          { model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false }
        ],
        order: [['variant_id', 'ASC']]
      });

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

// Crear una promoción
exports.createPromotion = [
  validateCreatePromotion,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const {
        name, promotion_type, discount_value, min_quantity, min_order_count,
        min_unit_measure, applies_to, is_exclusive = true, start_date, end_date,
        variantIds = [], categoryIds = []
      } = req.body;

      const created_by = req.user.user_id;
      if (!created_by) {
        return res.status(401).json({ message: 'No se pudo identificar al usuario autenticado' });
      }

      const promotionData = {
        name, promotion_type, discount_value, min_quantity, min_order_count,
        min_unit_measure, applies_to, is_exclusive, start_date, end_date,
        created_by, status: 'active', variantIds, categoryIds
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

// Obtener todas las promociones (adaptado para usuarios y administradores)
exports.getAllPromotions = [
  validateGetAllPromotions,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { search, page: pageParam = 1, pageSize: pageSizeParam = 10, sort } = req.query;
      const page = parseInt(pageParam);
      const pageSize = parseInt(pageSizeParam);
      const isAdmin = req.user.roles.includes('administrador');

      if (page < 1 || pageSize < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos' });
      }

      const where = { status: 'active', start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } };
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { promotion_type: { [Op.like]: `%${search}%` } }
        ];
        if (!isNaN(parseFloat(search))) {
          where[Op.or].push({ discount_value: { [Op.between]: [parseFloat(search) - 0.01, parseFloat(search) + 0.01] } });
        }
      }

      let order = [['promotion_id', 'ASC']];
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['promotion_id', 'start_date', 'end_date', 'discount_value', 'created_at'];
        order = sortParams.filter(([column]) => validColumns.includes(column)).map(([column, direction]) => [column, direction.toUpperCase() || 'ASC']);
      }

      const { count, rows: promotions } = await promotionService.getPromotions({ where, order, page, pageSize });

      const formattedPromotions = promotions.map(promo => ({
        promotion_id: promo.promotion_id,
        name: promo.name,
        promotion_type: promo.promotion_type,
        discount_value: promo.discount_value,
        applies_to: promo.applies_to,
        is_exclusive: promo.is_exclusive,
        start_date: promo.start_date,
        end_date: promo.end_date,
        ...(isAdmin && {
          created_by: promo.created_by,
          created_at: promo.created_at,
          updated_by: promo.updated_by,
          updated_at: promo.updated_at,
          product_variants_count: promo.ProductVariants ? promo.ProductVariants.length : 0,
          category_count: promo.Categories ? promo.Categories.length : 0
        })
      }));

      res.status(200).json({
        message: 'Promociones obtenidas exitosamente',
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
    if (!promotion) {
      return res.status(404).json({ message: 'Promoción no encontrada o inactiva' });
    }

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
      variantIds: promotion.ProductVariants ? promotion.ProductVariants.map(v => ({ variant_id: v.variant_id, sku: v.sku })) : [],
      categoryIds: promotion.Categories ? promotion.Categories.map(c => ({ category_id: c.category_id, name: c.name })) : []
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
  body('name').optional().trim().isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres.'),
  body('promotion_type').optional().isIn(['quantity_discount', 'order_count_discount', 'unit_discount']).withMessage('Tipo de promoción inválido'),
  body('discount_value').optional().isFloat({ min: 0, max: 100 }).withMessage('El valor de descuento debe estar entre 0 y 100'),
  body('min_quantity').optional().isInt({ min: 1 }).withMessage('La cantidad mínima debe ser un entero mayor o igual a 1'),
  body('min_order_count').optional().isInt({ min: 1 }).withMessage('El conteo mínimo de pedidos debe ser un entero mayor o igual a 1'),
  body('min_unit_measure').optional().isFloat({ min: 0 }).withMessage('La medida mínima debe ser un número mayor o igual a 0'),
  body('applies_to').optional().isIn(['specific_products', 'specific_categories', 'all']).withMessage('El campo "applies_to" debe ser válido'),
  body('is_exclusive').optional().isBoolean().withMessage('El campo "is_exclusive" debe ser un booleano'),
  body('start_date').optional().isISO8601().withMessage('La fecha de inicio debe ser una fecha válida'),
  body('end_date').optional().isISO8601().withMessage('La fecha de fin debe ser una fecha válida')
    .custom((end_date, { req }) => {
      const start_date = req.body.start_date || req.body.existingStartDate;
      if (start_date && new Date(end_date) <= new Date(start_date)) {
        throw new Error('La fecha de fin debe ser posterior a la fecha de inicio');
      }
      return true;
    }),
  body('status').optional().isIn(['active', 'inactive']).withMessage('El estado debe ser "active" o "inactive"'),
  body('variantIds').optional().isArray().withMessage('variantIds debe ser un arreglo'),
  body('categoryIds').optional().isArray().withMessage('categoryIds debe ser un arreglo'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
    }

    const { id } = req.params;
    const { name, promotion_type, discount_value, min_quantity, min_order_count, min_unit_measure, applies_to, is_exclusive, start_date, end_date, status, variantIds, categoryIds } = req.body;

    try {
      const promotionData = {
        name, promotion_type, discount_value, min_quantity, min_order_count, min_unit_measure, applies_to, is_exclusive, start_date, end_date, status, updated_by: req.user.user_id
      };

      const promotion = await promotionService.updatePromotion(id, promotionData, variantIds || [], categoryIds || []);
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

// Eliminar una promoción
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

// Aplicar una promoción al carrito
exports.applyPromotion = [
  validateApplyPromotion,
  async (req, res) => {
    const transaction = await Cart.sequelize.transaction();
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const { promotion_id } = req.body;
      const user_id = req.user.user_id;
      if (!user_id) {
        await transaction.rollback();
        return res.status(401).json({ message: 'Usuario no autenticado' });
      }

      // Obtener el carrito activo
      const cart = await Cart.findOne({
        where: { user_id, status: 'active' },
        include: [{ model: CartDetail, include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }] }],
        transaction
      });

      if (!cart || !cart.CartDetails.length) {
        await transaction.rollback();
        return res.status(400).json({ message: 'No hay un carrito activo o está vacío' });
      }

      // Verificar la promoción
      const promotion = await promotionService.getPromotionById(promotion_id);
      if (!promotion) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Promoción no encontrada o inactiva' });
      }

      // Verificar si la promoción ya está aplicada
      const existingUsage = await CouponUsage.findOne({
        where: { promotion_id, cart_id: cart.cart_id, user_id },
        transaction
      });
      if (existingUsage) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Esta promoción ya está aplicada al carrito' });
      }

      // Verificar aplicabilidad
      const cartDetails = cart.CartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: detail.unit_measure || 0,
        subtotal: parseFloat(detail.subtotal)
      }));

      const isApplicable = await promotionService.isPromotionApplicable(promotion, cartDetails, user_id);
      if (!isApplicable) {
        await transaction.rollback();
        return res.status(400).json({ message: 'La promoción no es aplicable al carrito actual' });
      }

      // Si la promoción es exclusiva, eliminar otras promociones
      if (promotion.is_exclusive) {
        await CouponUsage.destroy({ where: { cart_id: cart.cart_id, user_id }, transaction });
      }

      // Aplicar descuentos
      const { updatedOrderDetails, totalDiscount } = await promotionService.applyPromotions(cartDetails, [promotion]);
      for (const detail of cart.CartDetails) {
        const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
        await detail.update({ discount_applied: updatedDetail.discount_applied }, { transaction });
      }

      // Actualizar totales del carrito
      const subtotal = cart.CartDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal), 0);
      await cart.update({
        total_discount: totalDiscount,
        total: subtotal - totalDiscount
      }, { transaction });

      // Registrar en coupon_usages
      await CouponUsage.create({
        promotion_id,
        user_id,
        cart_id: cart.cart_id,
        order_id: null,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      // Generar mensaje de progreso
      const progress = await promotionService.getPromotionProgress(promotion, cartDetails, user_id);

      await transaction.commit();
      res.status(200).json({
        message: 'Promoción aplicada exitosamente',
        cart: {
          cart_id: cart.cart_id,
          total_discount: totalDiscount,
          total: subtotal - totalDiscount
        },
        promotion_progress: progress
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al aplicar la promoción', error: error.message });
    }
  }
];

// Obtener promociones disponibles para el usuario
exports.getAvailablePromotions = async (req, res) => {
  try {
    const user_id = req.user.user_id;
    if (!user_id) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    // Obtener el carrito activo
    const cart = await Cart.findOne({
      where: { user_id, status: 'active' },
      include: [{ model: CartDetail, include: [{ model: ProductVariant, include: [{ model: Product, attributes: ['category_id'] }] }] }]
    });

    const cartDetails = cart && cart.CartDetails.length ? cart.CartDetails.map(detail => ({
      variant_id: detail.variant_id,
      quantity: detail.quantity,
      unit_measure: detail.unit_measure || 0,
      subtotal: parseFloat(detail.subtotal)
    })) : [];

    // Obtener promociones aplicables
    const promotions = await promotionService.getApplicablePromotions(cartDetails, user_id);

    // Obtener todas las promociones activas para calcular progreso
    const allPromotions = await promotionService.getPromotions({
      where: { status: 'active', start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } }
    });
    const promotionProgress = [];
    for (const promo of allPromotions.rows) {
      const progress = await promotionService.getPromotionProgress(promo, cartDetails, user_id);
      promotionProgress.push({
        promotion_id: promo.promotion_id,
        name: promo.name,
        promotion_type: promo.promotion_type,
        discount_value: promo.discount_value,
        is_applicable: promotions.some(p => p.promotion_id === promo.promotion_id),
        progress_message: progress.message
      });
    }

    res.status(200).json({
      message: 'Promociones disponibles obtenidas exitosamente',
      promotions: promotions.map(p => ({
        promotion_id: p.promotion_id,
        name: p.name,
        promotion_type: p.promotion_type,
        discount_value: p.discount_value
      })),
      promotion_progress
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener promociones disponibles', error: error.message });
  }
};