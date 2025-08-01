const { Op } = require('sequelize');
const { body, query, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');
const loggerUtils = require('../utils/loggerUtils');
const { Product, ProductVariant, ProductImage, Cart, CartDetail, CouponUsage, Coupon } = require('../models/Associations');

const promotionService = new PromotionService();

// Validations for getAllPromotions
const validateGetAllPromotions = [
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
  query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "promotion_id:ASC,start_date:DESC").'),
  query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.')
];

// Validations for createPromotion
const validateCreatePromotion = [
  body('name').notEmpty().withMessage('El nombre de la promoción es obligatorio'),
  body('coupon_type').isIn(['percentage_discount', 'fixed_discount', 'free_shipping']).withMessage('Tipo de cupón inválido'),
  body('discount_value').isFloat({ min: 0 }).withMessage('El valor de descuento debe ser un número mayor o igual a 0'),
  body('max_uses').optional().isInt({ min: 1 }).withMessage('El número máximo de usos debe ser un entero positivo'),
  body('max_uses_per_user').optional().isInt({ min: 1 }).withMessage('El número máximo de usos por usuario debe ser un entero positivo'),
  body('min_order_value').optional().isFloat({ min: 0 }).withMessage('El valor mínimo de la orden debe ser un número mayor o igual a 0'),
  body('free_shipping_enabled').optional().isBoolean().withMessage('El campo "free_shipping_enabled" debe ser un booleano'),
  body('applies_to').isIn(['specific_products', 'specific_categories', 'all']).withMessage('El campo "applies_to" debe ser "specific_products", "specific_categories" o "all"'),
  body('is_exclusive').optional().isBoolean().withMessage('El campo "is_exclusive" debe ser un booleano'),
  body('start_date').isISO8601().withMessage('La fecha de inicio debe ser una fecha válida en formato ISO8601'),
  body('end_date').isISO8601().withMessage('La fecha de fin debe ser una fecha válida en formato ISO8601'),
  body('variantIds').optional().isArray().withMessage('variantIds debe ser un arreglo'),
  body('categoryIds').optional().isArray().withMessage('categoryIds debe ser un arreglo'),
  body('coupon_code').optional().isString().trim().withMessage('El código de cupón debe ser una cadena de texto')
];

// Validations for applyPromotion
const validateApplyPromotion = [
  body('promotion_id').optional().isInt({ min: 1 }).withMessage('El promotion_id debe ser un entero positivo'),
  body('coupon_code').optional().isString().trim().withMessage('El código de cupón debe ser una cadena de texto'),
  body().custom((body) => {
    if (!body.promotion_id && !body.coupon_code) {
      throw new Error('Se debe proporcionar al menos un promotion_id o un coupon_code');
    }
    return true;
  })
];

// Validations for updatePromotion
const validateUpdatePromotion = [
  body('name').optional().trim().isLength({ min: 3, max: 100 }).withMessage('El nombre debe tener entre 3 y 100 caracteres.'),
  body('coupon_type').optional().isIn(['percentage_discount', 'fixed_discount', 'free_shipping']).withMessage('Tipo de cupón inválido'),
  body('discount_value').optional().isFloat({ min: 0 }).withMessage('El valor de descuento debe ser un número mayor o igual a 0'),
  body('max_uses').optional().isInt({ min: 1 }).withMessage('El número máximo de usos debe ser un entero positivo'),
  body('max_uses_per_user').optional().isInt({ min: 1 }).withMessage('El número máximo de usos por usuario debe ser un entero positivo'),
  body('min_order_value').optional().isFloat({ min: 0 }).withMessage('El valor mínimo de la orden debe ser un número mayor o igual a 0'),
  body('free_shipping_enabled').optional().isBoolean().withMessage('El campo "free_shipping_enabled" debe ser un booleano'),
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
  body('coupon_code').optional().isString().trim().withMessage('El código de cupón debe ser una cadena de texto')
];

// Validations for getAllVariants
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
        name, coupon_type, discount_value, max_uses, max_uses_per_user, min_order_value,
        free_shipping_enabled, applies_to, is_exclusive = true, start_date, end_date,
        variantIds = [], categoryIds = [], coupon_code
      } = req.body;

      const created_by = req.user.user_id;
      if (!created_by) {
        return res.status(401).json({ message: 'No se pudo identificar al usuario autenticado' });
      }

      const promotionData = {
        name, coupon_type, discount_value, max_uses, max_uses_per_user, min_order_value,
        free_shipping_enabled, applies_to, is_exclusive, start_date, end_date, created_by,
        status: 'active', variantIds, categoryIds, coupon_code
      };

      const newPromotion = await promotionService.createPromotion(promotionData);

      res.status(201).json({
        message: 'Promoción creada exitosamente',
        promotion: {
          promotion_id: newPromotion.promotion_id,
          name: newPromotion.name,
          coupon_type: newPromotion.coupon_type,
          discount_value: newPromotion.discount_value,
          max_uses: newPromotion.max_uses,
          max_uses_per_user: newPromotion.max_uses_per_user,
          min_order_value: newPromotion.min_order_value,
          free_shipping_enabled: newPromotion.free_shipping_enabled,
          applies_to: newPromotion.applies_to,
          is_exclusive: newPromotion.is_exclusive,
          start_date: newPromotion.start_date,
          end_date: newPromotion.end_date,
          coupon_code: newPromotion.Coupon?.code || null
        }
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la promoción', error: error.message });
    }
  }
];

// Obtener todas las promociones
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
      const isAdmin = req.user.user_type.includes('administrador');

      if (page < 1 || pageSize < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos' });
      }

      const where = { status: 'active', start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } };
      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { coupon_type: { [Op.like]: `%${search}%` } },
          { '$Coupon.code$': { [Op.like]: `%${search}%` } }
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

      const { count, rows: promotions } = await promotionService.getPromotions({
        where,
        order,
        page,
        pageSize,
        include: [{ model: Coupon, attributes: ['code'] }]
      });

      const formattedPromotions = promotions.map(promo => ({
        promotion_id: promo.promotion_id,
        name: promo.name,
        coupon_type: promo.coupon_type,
        discount_value: promo.discount_value,
        max_uses: promo.max_uses,
        max_uses_per_user: promo.max_uses_per_user,
        min_order_value: promo.min_order_value,
        free_shipping_enabled: promo.free_shipping_enabled,
        applies_to: promo.applies_to,
        is_exclusive: promo.is_exclusive,
        start_date: promo.start_date,
        end_date: promo.end_date,
        coupon_code: promo.Coupon?.code || null,
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
      coupon_type: promotion.coupon_type,
      discount_value: promotion.discount_value,
      max_uses: promotion.max_uses,
      max_uses_per_user: promotion.max_uses_per_user,
      min_order_value: promotion.min_order_value,
      free_shipping_enabled: promotion.free_shipping_enabled,
      applies_to: promotion.applies_to,
      is_exclusive: promotion.is_exclusive,
      start_date: promotion.start_date,
      end_date: promotion.end_date,
      status: promotion.status,
      coupon_code: promotion.Coupon?.code || null,
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
  validateUpdatePromotion,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
    }

    const { id } = req.params;
    const {
      name, coupon_type, discount_value, max_uses, max_uses_per_user, min_order_value,
      free_shipping_enabled, applies_to, is_exclusive, start_date, end_date, status,
      variantIds, categoryIds, coupon_code
    } = req.body;

    try {
      const promotionData = {
        name, coupon_type, discount_value, max_uses, max_uses_per_user, min_order_value,
        free_shipping_enabled, applies_to, is_exclusive, start_date, end_date, status,
        updated_by: req.user.user_id, coupon_code
      };

      const promotion = await promotionService.updatePromotion(id, promotionData, variantIds || [], categoryIds || []);
      if (!promotion) {
        return res.status(404).json({ message: 'Promoción no encontrada' });
      }

      loggerUtils.logUserActivity(req.user.user_id, 'update', `Promoción actualizada: ${id}`);
      res.status(200).json({
        message: 'Promoción actualizada exitosamente',
        promotion: {
          promotion_id: promotion.promotion_id,
          name: promotion.name,
          coupon_type: promotion.coupon_type,
          discount_value: promotion.discount_value,
          max_uses: promotion.max_uses,
          max_uses_per_user: promotion.max_uses_per_user,
          min_order_value: promotion.min_order_value,
          free_shipping_enabled: promotion.free_shipping_enabled,
          applies_to: promotion.applies_to,
          is_exclusive: promotion.is_exclusive,
          start_date: promotion.start_date,
          end_date: promotion.end_date,
          coupon_code: promotion.Coupon?.code || null
        }
      });
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

// Aplicar una promoción o cupón al carrito
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

      const { promotion_id, coupon_code } = req.body;
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

      // Preparar los detalles del carrito para PromotionService
      const cartDetails = cart.CartDetails.map(detail => ({
        variant_id: detail.variant_id,
        quantity: detail.quantity,
        unit_measure: detail.unit_measure || 0,
        subtotal: parseFloat(detail.subtotal),
        category_id: detail.ProductVariant?.Product?.category_id || null
      }));

      // Obtener promociones aplicables
      const applicablePromotions = await promotionService.getApplicablePromotions(cartDetails, user_id, coupon_code, transaction);
      let selectedPromotion = null;

      if (promotion_id) {
        selectedPromotion = applicablePromotions.find(p => p.promotion_id === parseInt(promotion_id));
        if (!selectedPromotion) {
          await transaction.rollback();
          return res.status(400).json({ message: 'La promoción no es aplicable o no encontrada' });
        }
      } else if (coupon_code) {
        selectedPromotion = applicablePromotions.find(p => p.coupon_code === coupon_code);
        if (!selectedPromotion) {
          await transaction.rollback();
          return res.status(400).json({ message: 'El cupón no es válido o no aplicable' });
        }
      }

      if (!selectedPromotion) {
        await transaction.rollback();
        return res.status(400).json({ message: 'No se proporcionó una promoción o cupón válido' });
      }

      // Verificar si la promoción/cupón ya está aplicado
      const existingUsage = await CouponUsage.findOne({
        where: { promotion_id: selectedPromotion.promotion_id, cart_id: cart.cart_id, user_id },
        transaction
      });
      if (existingUsage) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Esta promoción o cupón ya está aplicado al carrito' });
      }

      // Si la promoción es exclusiva, eliminar otras promociones
      if (selectedPromotion.is_exclusive) {
        await CouponUsage.destroy({ where: { cart_id: cart.cart_id, user_id }, transaction });
      }

      // Aplicar descuentos
      const { updatedOrderDetails, totalDiscount } = await promotionService.applyPromotions(cartDetails, [selectedPromotion], user_id, cart.cart_id, coupon_code, transaction);
      for (const detail of cart.CartDetails) {
        const updatedDetail = updatedOrderDetails.find(d => d.variant_id === detail.variant_id);
        await detail.update({ discount_applied: updatedDetail.discount_applied }, { transaction });
      }

      // Actualizar totales del carrito
      const subtotal = cart.CartDetails.reduce((sum, detail) => sum + parseFloat(detail.subtotal), 0);
      await cart.update({
        total_discount: totalDiscount,
        total: subtotal - totalDiscount,
        coupon_code: coupon_code || null
      }, { transaction });

      // Registrar en coupon_usages
      await CouponUsage.create({
        promotion_id: selectedPromotion.promotion_id,
        user_id,
        cart_id: cart.cart_id,
        order_id: null,
        coupon_id: selectedPromotion.coupon_id || null,
        created_at: new Date(),
        updated_at: new Date()
      }, { transaction });

      // Generar mensaje de progreso
      const progress = await promotionService.getPromotionProgress(
        {
          promotion_id: selectedPromotion.promotion_id,
          coupon_type: selectedPromotion.coupon_type,
          discount_value: selectedPromotion.discount_value,
          max_uses: selectedPromotion.max_uses,
          max_uses_per_user: selectedPromotion.max_uses_per_user,
          min_order_value: selectedPromotion.min_order_value,
          free_shipping_enabled: selectedPromotion.free_shipping_enabled,
          applies_to: selectedPromotion.applies_to,
          Coupon: selectedPromotion.coupon_code ? { code: selectedPromotion.coupon_code } : null
        },
        cartDetails,
        user_id,
        selectedPromotion.coupon_code,
        transaction
      );

      await transaction.commit();
      res.status(200).json({
        message: 'Promoción o cupón aplicado exitosamente',
        cart: {
          cart_id: cart.cart_id,
          total_discount: totalDiscount,
          total: subtotal - totalDiscount
        },
        promotion: {
          promotion_id: selectedPromotion.promotion_id,
          name: selectedPromotion.name,
          coupon_type: selectedPromotion.coupon_type,
          discount_value: selectedPromotion.discount_value,
          coupon_code: selectedPromotion.coupon_code || null
        },
        promotion_progress: progress
      });
    } catch (error) {
      await transaction.rollback();
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al aplicar la promoción o cupón', error: error.message });
    }
  }
];

// Obtener promociones disponibles para el usuario
exports.getAvailablePromotions = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
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

    const cartDetails = cart && cart.CartDetails.length ? cart.CartDetails.map(detail => ({
      variant_id: detail.variant_id,
      quantity: detail.quantity,
      unit_measure: detail.unit_measure || 0,
      subtotal: parseFloat(detail.subtotal),
      category_id: detail.ProductVariant?.Product?.category_id || null
    })) : [];

    // Obtener promociones aplicables
    const promotions = await promotionService.getApplicablePromotions(cartDetails, user_id, null, transaction);

    // Obtener todas las promociones activas para calcular progreso
    const allPromotions = await promotionService.getPromotions({
      where: { status: 'active', start_date: { [Op.lte]: new Date() }, end_date: { [Op.gte]: new Date() } },
      include: [{ model: Coupon, attributes: ['code'] }],
      transaction
    });

    const promotionProgress = [];
    for (const promo of allPromotions.rows) {
      const progress = await promotionService.getPromotionProgress(
        promo,
        cartDetails,
        user_id,
        promo.Coupon?.code || null,
        transaction
      );
      promotionProgress.push({
        promotion_id: promo.promotion_id,
        name: promo.name,
        coupon_type: promo.coupon_type,
        discount_value: parseFloat(promo.discount_value).toFixed(2),
        is_applicable: promotions.some(p => p.promotion_id === promo.promotion_id),
        coupon_code: promo.Coupon?.code || null,
        progress_message: progress.message
      });
    }

    await transaction.commit();
    res.status(200).json({
      message: 'Promociones disponibles obtenidas exitosamente',
      promotions: promotions.map(p => ({
        promotion_id: p.promotion_id,
        name: p.name,
        coupon_type: p.coupon_type,
        discount_value: parseFloat(p.discount_value).toFixed(2),
        coupon_code: p.coupon_code || null
      })),
      promotionProgress // Fixed typo from promotion_progress to promotionProgress
    });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener promociones disponibles', error: error.message });
  }
};