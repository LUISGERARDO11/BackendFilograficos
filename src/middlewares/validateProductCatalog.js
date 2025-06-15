const { body, query, param } = require('express-validator');

// Validaciones comunes reutilizables
const optionalString = (field, message) => 
  body(field)
    .optional()
    .isString()
    .withMessage(message)
    .trim()
    .escape();

const requiredString = (field, message) => 
  body(field)
    .trim()
    .notEmpty()
    .withMessage(message);

const optionalInt = (field, message) => 
  body(field)
    .optional()
    .isInt()
    .withMessage(message);

const requiredInt = (field, message) => 
  body(field)
    .isInt()
    .withMessage(message);

const positiveInt = (field, message) => 
  body(field)
    .custom(value => {
      const num = parseInt(value, 10);
      return Number.isInteger(num) && num >= 1;
    })
    .withMessage(message)
    .toInt();

const positiveFloat = (field, message) => 
  body(field)
    .isFloat({ min: 0 })
    .withMessage(message);

const booleanField = (field, message) => 
  body(field)
    .custom(value => ['true', 'false', true, false].includes(value))
    .withMessage(message)
    .toBoolean();

const optionalArray = (field, message) => 
  body(field)
    .optional()
    .isArray()
    .withMessage(message);

const requiredArray = (field, minLength = 1, message) => 
  body(field)
    .custom(value => {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) && parsed.length >= minLength;
      }
      return Array.isArray(value) && value.length >= minLength;
    })
    .withMessage(message);

// Validaciones para crear un producto
const validateProduct = [
  requiredString('name', 'El nombre es obligatorio').escape(),
  optionalString('description', 'La descripción debe ser una cadena válida'),
  body('product_type')
    .isIn(['Existencia', 'Personalizado'])
    .withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  requiredInt('category_id', 'El ID de la categoría debe ser un número entero'),
  optionalInt('collaborator_id', 'El ID del colaborador debe ser un número entero'),
  positiveInt('standard_delivery_days', 'Los días de entrega estándar deben ser un número entero mayor o igual a 1'),
  booleanField('urgent_delivery_enabled', 'La opción de entrega urgente debe ser un booleano'),
  positiveInt('urgent_delivery_days', 'Los días de entrega urgente deben ser un número entero mayor o igual a 1')
    .if(body('urgent_delivery_enabled').custom(value => value === 'true' || value === true))
    .custom((value, { req }) => value < (parseInt(req.body.standard_delivery_days, 10) || 1))
    .withMessage('Los días de entrega urgente deben ser menores que los días estándar'),
  positiveFloat('urgent_delivery_cost', 'El costo de entrega urgente debe ser un número no negativo')
    .if(body('urgent_delivery_enabled').custom(value => value === 'true' || value === true)),
  optionalArray('customizations', 'Las personalizaciones deben ser un arreglo')
    .custom(value => {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) throw new Error('Las personalizaciones deben ser un arreglo');
        return true;
      }
      return Array.isArray(value);
    }),
  body('customizations.*.type')
    .optional()
    .isIn(['text', 'image', 'file'])
    .withMessage('Tipo de personalización no válido'),
  requiredString('customizations.*.description', 'La descripción de la personalización es obligatoria'),
  requiredArray('variants', 1, 'Debe proporcionar al menos una variante'),
  requiredString('variants.*.sku', 'El SKU de la variante es obligatorio').escape(),
  positiveFloat('variants.*.production_cost', 'El costo de producción debe ser un número positivo'),
  positiveFloat('variants.*.profit_margin', 'El margen de ganancia debe ser un número positivo'),
  positiveInt('variants.*.stock', 'El stock debe ser un número entero positivo'),
  optionalInt('variants.*.stock_threshold', 'El umbral de stock debe ser un número entero positivo'),
  optionalArray('variants.*.attributes', 'Los atributos deben ser un arreglo'),
  requiredInt('variants.*.attributes.*.attribute_id', 'El ID del atributo debe ser un número entero'),
  optionalString('variants.*.attributes.*.value', 'El valor del atributo debe ser una cadena válida'),
];

// Validaciones para eliminar un producto
const validateDeleteProduct = [
  positiveInt('product_id', 'El ID del producto debe ser un número entero positivo').toInt()
];

// Validaciones para obtener un producto por ID
const validateGetProductById = [
  positiveInt('product_id', 'El ID del producto debe ser un número entero positivo').toInt()
];

// Validaciones para actualizar un producto
const validateUpdateProduct = [
  positiveInt('product_id', 'El ID del producto debe ser un número entero positivo').toInt(),
  requiredString('name', 'El nombre no puede estar vacío').optional().escape(),
  optionalString('description', 'La descripción debe ser una cadena válida'),
  body('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  optionalInt('category_id', 'El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional().custom(value => value === null || Number.isInteger(parseInt(value))).withMessage('El ID del colaborador debe ser un número entero o null'),
  positiveInt('standard_delivery_days', 'Los días de entrega estándar deben ser un número entero mayor o igual a 1').optional(),
  body('urgent_delivery_enabled').optional().isBoolean().withMessage('La opción de entrega urgente debe ser un booleano'),
  positiveInt('urgent_delivery_days', 'Los días de entrega urgente deben ser un número entero mayor o igual a 1')
    .if(body('urgent_delivery_enabled').equals(true))
    .custom((value, { req }) => value < (req.body.standard_delivery_days || 1))
    .withMessage('Los días de entrega urgente deben ser menores que los días estándar'),
  positiveFloat('urgent_delivery_cost', 'El costo de entrega urgente debe ser un número no negativo')
    .if(body('urgent_delivery_enabled').equals(true)),
  optionalArray('variants', 'Las variantes deben ser un arreglo'),
  optionalInt('variants.*.variant_id', 'El ID de la variante debe be un número entero'),
  requiredString('variants.*.sku', 'El SKU es obligatorio para nuevas variantes').if(body('variants.*.variant_id').not().exists()).escape(),
  positiveFloat('variants.*.production_cost', 'El costo de producción debe ser un número positivo').optional(),
  positiveFloat('variants.*.profit_margin', 'El margen de ganancia debe ser un número positivo').optional(),
  optionalArray('variants.*.imagesToDelete', 'imagesToDelete debe ser un arreglo'),
  requiredInt('variants.*.imagesToDelete.*', 'Los IDs de imágenes a eliminar deben ser números enteros'),
  optionalArray('variants.*.attributes', 'Los atributos deben ser un arreglo'),
  optionalInt('variants.*.attributes.*.attribute_id', 'El ID del atributo debe ser un número entero'),
  optionalString('variants.*.attributes.*.value', 'El valor del atributo debe ser una cadena válida'),
  optionalArray('customizations', 'Las personalizaciones deben ser un arreglo'),
  body('customizations.*.type').optional().isIn(['text', 'image', 'file']).withMessage('Tipo de personalización no válido'),
  requiredString('customizations.*.description', 'La descripción de la personalización no puede estar vacía').optional(),
];

// Validaciones para eliminar variantes
const validateDeleteVariants = [
  positiveInt('product_id', 'El ID del producto debe ser un número entero positivo').toInt(),
  requiredArray('variant_ids', 1, 'Debe proporcionar al menos un ID de variante en un arreglo')
    .custom(value => value.every(id => Number.isInteger(id) && id > 0))
    .withMessage('Todos los IDs de variantes deben ser números enteros positivos'),
];

// Validaciones para obtener todos los productos
const validateGetAllProducts = [
  optionalString('search', 'El término de búsqueda debe ser una cadena válida'),
  positiveInt('collaborator_id', 'El ID del colaborador debe ser un entero positivo').optional(),
  positiveInt('category_id', 'El ID de la categoría debe ser un entero positivo').optional(),
  query('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  positiveInt('page', 'La página debe ser un entero positivo').optional(),
  positiveInt('pageSize', 'El tamaño de página debe ser un entero positivo').optional(),
  query('sort').optional()
    .matches(/^[a-z_]+:(ASC|DESC)(,[a-z_]+:(ASC|DESC))*$/i)
    .withMessage('El parámetro sort debe tener el formato "column:direction,column:direction"'),
];

// Nuevas validaciones para productPriceController
const validateGetAllVariants = [
  query('search').optional().trim().escape(),
  positiveInt('category_id', 'El ID de la categoría debe ser un entero positivo').optional(),
  query('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  positiveInt('page', 'La página debe ser un entero positivo').optional(),
  positiveInt('limit', 'El límite debe ser un entero positivo').optional(),
  query('sortBy').optional().isIn(['sku', 'calculated_price', 'production_cost', 'profit_margin', 'product_name', 'updated_at']).withMessage('El campo de ordenamiento debe ser válido'),
  query('sortOrder').optional().isIn(['ASC', 'DESC']).withMessage('El orden debe ser "ASC" o "DESC"'),
];

const validateGetVariantById = [
  positiveInt('id', 'El ID de la variante debe ser un entero positivo').toInt()
];

const validateUpdateVariantPrice = [
  positiveInt('id', 'El ID de la variante debe ser un entero positivo').toInt(),
  positiveFloat('production_cost', 'El costo de producción debe ser un número positivo'),
  positiveFloat('profit_margin', 'El margen de ganancia debe ser un número positivo'),
];

const validateGetPriceHistory = [
  positiveInt('variant_id', 'El ID de la variante debe ser un entero positivo').toInt()
];

const validateBatchUpdateVariantPrices = [
  requiredArray('variant_ids', 1, 'Debe proporcionar al menos un ID de variante')
    .custom(value => value.every(id => Number.isInteger(id) && id > 0)).withMessage('Todos los IDs de variantes deben ser enteros positivos'),
  body('production_cost').isFloat({ min: 0.01 }).withMessage('El costo de producción debe ser un número positivo mayor a 0.01'),
  body('profit_margin').isFloat({ min: 0.01 }).withMessage('El margen de ganancia debe ser un número positivo mayor a 0.01'),
];

const validateBatchUpdateVariantPricesIndividual = [
  requiredArray('variants', 1, 'Debe proporcionar al menos una variante para actualizar'),
  positiveInt('variants.*.variant_id', 'El ID de la variante debe ser un entero positivo'),
  body('variants.*.production_cost').isFloat({ min: 0.01 }).withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin').isFloat({ min: 0.01 }).withMessage('El margen de ganancia debe ser un número positivo'),
];

module.exports = {
  validateProduct,
  validateDeleteProduct,
  validateGetProductById,
  validateUpdateProduct,
  validateDeleteVariants,
  validateGetAllProducts,
  validateGetAllVariants,
  validateGetVariantById,
  validateUpdateVariantPrice,
  validateGetPriceHistory,
  validateBatchUpdateVariantPrices,
  validateBatchUpdateVariantPricesIndividual,
};