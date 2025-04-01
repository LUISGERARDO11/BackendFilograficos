/* The above code is a module in Node.js that exports several arrays of validation middleware functions
using the `express-validator` library. These validation functions are used to validate incoming data
for different routes related to managing products in an application. Here is a summary of what each
array of validation functions is doing: */
const { body, query, param, validationResult } = require('express-validator');

// Validaciones para crear un producto
const validateProduct = [
  // Validaciones para el producto base
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('description').optional().trim().escape(),
  body('product_type').isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  body('category_id').isInt().withMessage('El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional({ nullable: true }).isInt().withMessage('El ID del colaborador debe ser un número entero'),
  body('customizations').optional().custom((value) => {
    if (typeof value === 'string') {
      const parsed = JSON.parse(value);
      if (!Array.isArray(parsed)) throw new Error('Las personalizaciones deben ser un arreglo');
      return true;
    }
    return Array.isArray(value);
  }).withMessage('Las personalizaciones deben ser un arreglo'),
  body('customizations.*.type').optional().isIn(['text', 'image', 'file']).withMessage('Tipo de personalización no válido'),
  body('customizations.*.description').optional().trim().notEmpty().withMessage('La descripción de la personalización es obligatoria'),

  // Validaciones para las variantes (al menos una es obligatoria)
  body('variants').isArray({ min: 1 }).withMessage('Debe proporcionar al menos una variante'),
  body('variants.*.sku').trim().notEmpty().withMessage('El SKU de la variante es obligatorio').escape(),
  body('variants.*.production_cost').isFloat({ min: 0 }).withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin').isFloat({ min: 0 }).withMessage('El margen de ganancia debe ser un número positivo'),
  body('variants.*.stock').isInt({ min: 0 }).withMessage('El stock debe ser un número entero positivo'),
  body('variants.*.stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo'),
  body('variants.*.attributes').optional().isArray().withMessage('Los atributos deben ser un arreglo'),
  body('variants.*.attributes.*.attribute_id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('variants.*.attributes.*.value').trim().notEmpty().withMessage('El valor del atributo es obligatorio'),
];

// Validaciones para eliminar un producto
const validateDeleteProduct = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo')
];

// Validaciones para obtener un producto por ID
const validateGetProductById = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo')
];

// Validaciones para actualizar un producto
const validateUpdateProduct = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo'),
  body('name').optional().trim().notEmpty().withMessage('El nombre no puede estar vacío').escape(),
  body('description').optional().trim().escape(),
  body('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  body('category_id').optional().isInt().withMessage('El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional().custom(value => value === null || Number.isInteger(parseInt(value))).withMessage('El ID del colaborador debe ser un número entero o null'),
  body('variants').optional().isArray().withMessage('Las variantes deben ser un arreglo'),
  body('variants.*.variant_id').optional().isInt().withMessage('El ID de la variante debe ser un número entero'),
  body('variants.*.sku').if(body('variants.*.variant_id').not().exists()).trim().notEmpty().withMessage('El SKU es obligatorio para nuevas variantes').escape(),
  body('variants.*.production_cost').optional().isFloat({ min: 0 }).withMessage('El costo de producción debe ser un número positivo'),
  body('variants.*.profit_margin').optional().isFloat({ min: 0 }).withMessage('El margen de ganancia debe ser un número positivo'),
  body('variants.*.imagesToDelete').optional().isArray().withMessage('imagesToDelete debe ser un arreglo'),
  body('variants.*.imagesToDelete.*').isInt().withMessage('Los IDs de imágenes a eliminar deben ser números enteros'),
  body('variants.*.attributes').optional().isArray().withMessage('Los atributos deben ser un arreglo'),
  body('variants.*.attributes.*.attribute_id').optional().isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('variants.*.attributes.*.value').optional().trim().notEmpty().withMessage('El valor del atributo no puede estar vacío'),
  body('customizations').optional().isArray().withMessage('Las personalizaciones deben ser un arreglo'),
  body('customizations.*.type').isIn(['text', 'image', 'file']).withMessage('Tipo de personalización no válido'),
  body('customizations.*.description').optional().trim().notEmpty().withMessage('La descripción de la personalización no puede estar vacía')
];

// Validaciones para eliminar variantes
const validateDeleteVariants = [
  param('product_id').isInt({ min: 1 }).withMessage('El ID del producto debe ser un número entero positivo'),
  body('variant_ids').isArray({ min: 1 }).withMessage('Debe proporcionar al menos un ID de variante en un arreglo')
    .custom((value) => {
      if (!value.every(id => Number.isInteger(id) && id > 0)) {
        throw new Error('Todos los IDs de variantes deben ser números enteros positivos');
      }
      return true;
    })
];

// Validaciones para obtener todos los productos (movida desde el controlador)
const validateGetAllProducts = [
  query('search').optional().trim().escape(),
  query('collaborator_id').optional().isInt({ min: 1 }).withMessage('El ID del colaborador debe ser un entero positivo'),
  query('category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un entero positivo'),
  query('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un entero positivo'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un entero positivo'),
  query('sort').optional()
    .matches(/^([a-zA-Z_]+:(ASC|DESC),?)+$/i)
    .withMessage('El parámetro sort debe tener el formato "column:direction,column:direction"')
];

module.exports = {
  validateProduct,
  validateDeleteProduct,
  validateGetProductById,
  validateUpdateProduct,
  validateDeleteVariants,
  validateGetAllProducts,
};