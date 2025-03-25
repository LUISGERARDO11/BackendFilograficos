const { body, query, validationResult } = require('express-validator');
const PromotionService = require('../services/PromotionService');
const loggerUtils = require('../utils/loggerUtils');

const promotionService = new PromotionService();

// Validaciones para getAllPromotions
const validateGetAllPromotions = [
    query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo.'),
    query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo.'),
    query('status').optional().isIn(['active', 'inactive']).withMessage('El estado debe ser "active" o "inactive".'),
    query('sort').optional().isString().withMessage('El parámetro sort debe ser una cadena (ej. "promotion_id:ASC,start_date:DESC").'),
    query('search').optional().isString().withMessage('El término de búsqueda debe ser una cadena.'),
];
// Crear una nueva promoción
exports.createPromotion = [
  body('promotion_type')
    .isIn(['quantity_discount', 'order_count_discount', 'unit_discount'])
    .withMessage('El tipo de promoción debe ser válido.'),
  body('discount_value')
    .isFloat({ min: 0, max: 100 })
    .withMessage('El valor del descuento debe estar entre 0 y 100.'),
  body('start_date')
    .isISO8601()
    .withMessage('La fecha de inicio debe ser una fecha válida.'),
  body('end_date')
    .isISO8601()
    .withMessage('La fecha de fin debe ser una fecha válida.'),
  body('variantIds')
    .optional()
    .isArray()
    .withMessage('variantIds debe ser un arreglo.'),
  body('categoryIds')
    .optional()
    .isArray()
    .withMessage('categoryIds debe ser un arreglo.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { promotion_type, discount_value, start_date, end_date, variantIds, categoryIds, ...otherData } = req.body;

    try {
      const promotion = await promotionService.createPromotion(
        {
          promotion_type,
          discount_value,
          start_date,
          end_date,
          status: 'active',
          ...otherData
        },
        variantIds || [],
        categoryIds || []
      );

      loggerUtils.logUserActivity(req.user.user_id, 'create', `Promoción creada: ${promotion.promotion_id}`);
      res.status(201).json({ message: 'Promoción creada exitosamente', promotion });
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
          status,
          page: pageParam = 1,
          pageSize: pageSizeParam = 10,
          sort
        } = req.query;
  
        const page = parseInt(pageParam);
        const pageSize = parseInt(pageSizeParam);
  
        if (page < 1 || pageSize < 1) {
          return res.status(400).json({ message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos' });
        }
  
        // Filtros
        const where = {};
        if (status) {
          where.status = status;
        } else {
          where.status = 'active'; // Por defecto solo muestra activas si no se especifica
        }
  
        if (search) {
          where[Op.or] = [
            { promotion_type: { [Op.iLike]: `%${search}%` } }, // Búsqueda por tipo (insensible a mayúsculas)
          ];
          if (!isNaN(parseFloat(search))) {
            where[Op.or].push(
              { discount_value: { [Op.between]: [parseFloat(search) - 0.01, parseFloat(search) + 0.01] } } // Búsqueda por valor de descuento
            );
          }
        }
  
        // Ordenamiento
        let order = [['promotion_id', 'ASC']]; // Orden por defecto
        if (sort) {
          const sortParams = sort.split(',').map(param => param.trim().split(':'));
          const validColumns = ['promotion_id', 'start_date'];
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
  
        res.status(200).json({
          message: 'Promociones obtenidas exitosamente',
          promotions,
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

    res.status(200).json(promotion);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la promoción', error: error.message });
  }
};

// Actualizar una promoción
exports.updatePromotion = [
  body('promotion_type')
    .optional()
    .isIn(['quantity_discount', 'order_count_discount', 'unit_discount'])
    .withMessage('El tipo de promoción debe ser válido.'),
  body('discount_value')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('El valor del descuento debe estar entre 0 y 100.'),
  body('start_date')
    .optional()
    .isISO8601()
    .withMessage('La fecha de inicio debe ser una fecha válida.'),
  body('end_date')
    .optional()
    .isISO8601()
    .withMessage('La fecha de fin debe ser una fecha válida.'),
  body('status')
    .optional()
    .isIn(['active', 'inactive'])
    .withMessage('El estado debe ser "active" o "inactive".'),
  body('variantIds')
    .optional()
    .isArray()
    .withMessage('variantIds debe ser un arreglo.'),
  body('categoryIds')
    .optional()
    .isArray()
    .withMessage('categoryIds debe ser un arreglo.'),

  async (req, res) => {
    const { id } = req.params;
    const { promotion_type, discount_value, start_date, end_date, status, variantIds, categoryIds, ...otherData } = req.body;

    try {
      const promotion = await promotionService.updatePromotion(
        id,
        {
          promotion_type,
          discount_value,
          start_date,
          end_date,
          status,
          ...otherData
        },
        variantIds || [],
        categoryIds || []
      );

      loggerUtils.logUserActivity(req.user.user_id, 'update', `Promoción actualizada: ${id}`);
      res.status(200).json({ message: 'Promoción actualizada', promotion });
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

    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Promoción eliminada: ${id}`);
    res.status(200).json(result);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la promoción', error: error.message });
  }
};