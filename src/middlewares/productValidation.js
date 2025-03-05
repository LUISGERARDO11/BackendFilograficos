const { body, query, param, validationResult } = require('express-validator');

const validateProduct = [
  // Validaciones para el producto base
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('description').optional().trim().escape(),
  body('product_type').isIn(['Existencia', 'semi_personalizado', 'personalizado']).withMessage('Tipo de producto no válido'),
  body('category_id').isInt().withMessage('El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional({ nullable: true }).isInt().withMessage('El ID del colaborador debe ser un número entero'),

  // Validaciones para las variantes (al menos una es obligatoria)
  body('variants').isArray({ min: 1 }).withMessage('Debe proporcionar al menos una variante'),
  body('variants.*.sku').trim().notEmpty().withMessage('El SKU de la variante es obligatorio').escape(),
  body('variants.*.production_cost').isFloat({ min: 0 }).withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin').isFloat({ min: 0 }).withMessage('El margen de ganancia debe ser un número positivo'),
  body('variants.*.stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero positivo'),
  body('variants.*.stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo'),
  body('variants.*.attributes').isArray().withMessage('Los atributos deben ser un arreglo').optional({ nullable: true }),
  body('variants.*.attributes.*.attribute_id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('variants.*.attributes.*.value').trim().notEmpty().withMessage('El valor del atributo es obligatorio'),
  body('variants.*.customizations').optional().isArray().withMessage('Las personalizaciones deben ser un arreglo'),
  body('variants.*.customizations.*.type').optional().isIn(['Imagen', 'Texto']).withMessage('Tipo de personalización no válido'),
  body('variants.*.customizations.*.description').optional().trim().notEmpty().withMessage('La descripción de la personalización es obligatoria')
];

const validateGetProducts = [
    query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo'),
    query('sort').optional().isString().withMessage('El parámetro de ordenamiento debe ser una cadena (e.g., "name:ASC,product_id:DESC")')
];

const validateDeleteProduct = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo')
];

const validateGetProductById = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo')
];

const validateUpdateProduct = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo'),
  // Validaciones para el producto base
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('description').optional().trim().escape(),
  body('product_type').isIn(['Existencia', 'semi_personalizado', 'personalizado']).withMessage('Tipo de producto no válido'),
  body('category_id').isInt().withMessage('El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional({ nullable: true }).isInt().withMessage('El ID del colaborador debe ser un número entero'),

  // Validaciones para las variantes
  body('variants').isArray({ min: 1 }).withMessage('Debe proporcionar al menos una variante'),
  body('variants.*.sku').trim().notEmpty().withMessage('El SKU de la variante es obligatorio').escape(),
  body('variants.*.production_cost').isFloat({ min: 0 }).withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin').isFloat({ min: 0 }).withMessage('El margen de ganancia debe ser un número positivo'),
  body('variants.*.stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero positivo'),
  body('variants.*.stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo'),
  body('variants.*.attributes').isArray().withMessage('Los atributos deben ser un arreglo').optional({ nullable: true }),
  body('variants.*.attributes.*.attribute_id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('variants.*.attributes.*.value').trim().notEmpty().withMessage('El valor del atributo es obligatorio'),
  body('variants.*.customizations').optional().isArray().withMessage('Las personalizaciones deben ser un arreglo'),
  body('variants.*.customizations.*.type').optional().isIn(['Imagen', 'Texto']).withMessage('Tipo de personalización no válido'),
  body('variants.*.customizations.*.description').optional().trim().notEmpty().withMessage('La descripción de la personalización es obligatoria')
];

module.exports = {
  validateProduct,
  validateGetProducts,
  validateDeleteProduct,
  validateGetProductById,
  validateUpdateProduct
};