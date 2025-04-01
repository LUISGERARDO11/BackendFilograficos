const { body, query, param } = require('express-validator');

// Validaciones comunes reutilizables
const optionalString = (field) => body(field).optional().trim().escape();
const requiredString = (field) => body(field).trim().notEmpty();
const optionalInt = (field) => body(field).optional().isInt();
const requiredInt = (field) => body(field).isInt();
const positiveInt = (field) => body(field).isInt({ min: 1 });
const positiveFloat = (field) => body(field).isFloat({ min: 0 });
const optionalArray = (field) => body(field).optional().isArray();
const requiredArray = (field, minLength = 1) => body(field).isArray({ min: minLength });

// Validaciones para crear un producto
const validateProduct = [
  requiredString('name').withMessage('El nombre es obligatorio').escape(),
  optionalString('description'),
  body('product_type').isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  requiredInt('category_id').withMessage('El ID de la categoría debe ser un número entero'),
  optionalInt('collaborator_id').withMessage('El ID del colaborador debe ser un número entero'),
  optionalArray('customizations').withMessage('Las personalizaciones deben ser un arreglo')
    .custom(value => {
      if (typeof value === 'string') {
        const parsed = JSON.parse(value);
        if (!Array.isArray(parsed)) throw new Error('Las personalizaciones deben ser un arreglo');
        return true;
      }
      return Array.isArray(value);
    }),
  body('customizations.*.type').optional().isIn(['text', 'image', 'file']).withMessage('Tipo de personalización no válido'),
  requiredString('customizations.*.description').withMessage('La descripción de la personalización es obligatoria'),

  requiredArray('variants').withMessage('Debe proporcionar al menos una variante'),
  requiredString('variants.*.sku').withMessage('El SKU de la variante es obligatorio').escape(),
  positiveFloat('variants.*.production_cost').withMessage('El costo de producción debe ser un número positivo'),
  positiveFloat('variants.*.profit_margin').withMessage('El margen de ganancia debe ser un número positivo'),
  positiveInt('variants.*.stock').withMessage('El stock debe ser un número entero positivo'),
  optionalInt('variants.*.stock_threshold').withMessage('El umbral de stock debe ser un número entero positivo'),
  optionalArray('variants.*.attributes').withMessage('Los atributos deben ser un arreglo'),
  requiredInt('variants.*.attributes.*.attribute_id').withMessage('El ID del atributo debe ser un número entero'),
  requiredString('variants.*.attributes.*.value').withMessage('El valor del atributo es obligatorio'),
];

// Validaciones para eliminar un producto
const validateDeleteProduct = [
  positiveInt('product_id').withMessage('El ID del producto debe ser un número entero positivo').toInt()
];

// Validaciones para obtener un producto por ID
const validateGetProductById = [
  positiveInt('product_id').withMessage('El ID del producto debe ser un número entero positivo').toInt()
];

// Validaciones para actualizar un producto
const validateUpdateProduct = [
  positiveInt('product_id').withMessage('El ID del producto debe ser un número entero positivo').toInt(),
  requiredString('name').optional().withMessage('El nombre no puede estar vacío').escape(),
  optionalString('description'),
  body('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  optionalInt('category_id').withMessage('El ID de la categoría debe ser un número entero'),
  body('collaborator_id').optional().custom(value => value === null || Number.isInteger(parseInt(value))).withMessage('El ID del colaborador debe ser un número entero o null'),
  optionalArray('variants').withMessage('Las variantes deben ser un arreglo'),
  optionalInt('variants.*.variant_id').withMessage('El ID de la variante debe ser un número entero'),
  requiredString('variants.*.sku').if(body('variants.*.variant_id').not().exists()).withMessage('El SKU es obligatorio para nuevas variantes').escape(),
  positiveFloat('variants.*.production_cost').optional().withMessage('El costo de producción debe ser un número positivo'),
  positiveFloat('variants.*.profit_margin').optional().withMessage('El margen de ganancia debe ser un número positivo'),
  optionalArray('variants.*.imagesToDelete').withMessage('imagesToDelete debe ser un arreglo'),
  requiredInt('variants.*.imagesToDelete.*').withMessage('Los IDs de imágenes a eliminar deben ser números enteros'),
  optionalArray('variants.*.attributes').withMessage('Los atributos deben ser un arreglo'),
  optionalInt('variants.*.attributes.*.attribute_id').withMessage('El ID del atributo debe ser un número entero'),
  requiredString('variants.*.attributes.*.value').optional().withMessage('El valor del atributo no puede estar vacío'),
  optionalArray('customizations').withMessage('Las personalizaciones deben ser un arreglo'),
  body('customizations.*.type').isIn(['text', 'image', 'file']).withMessage('Tipo de personalización no válido'),
  requiredString('customizations.*.description').optional().withMessage('La descripción de la personalización no puede estar vacía')
];

// Validaciones para eliminar variantes
const validateDeleteVariants = [
  positiveInt('product_id').withMessage('El ID del producto debe ser un número entero positivo').toInt(),
  requiredArray('variant_ids').withMessage('Debe proporcionar al menos un ID de variante en un arreglo')
    .custom(value => value.every(id => Number.isInteger(id) && id > 0))
    .withMessage('Todos los IDs de variantes deben ser números enteros positivos')
];

// Validaciones para obtener todos los productos
const validateGetAllProducts = [
  optionalString('search'),
  positiveInt('collaborator_id').optional().withMessage('El ID del colaborador debe ser un entero positivo'),
  positiveInt('category_id').optional().withMessage('El ID de la categoría debe ser un entero positivo'),
  query('product_type').optional().isIn(['Existencia', 'Personalizado']).withMessage('El tipo de producto debe ser "Existencia" o "Personalizado"'),
  positiveInt('page').optional().withMessage('La página debe ser un entero positivo'),
  positiveInt('pageSize').optional().withMessage('El tamaño de página debe ser un entero positivo'),
  query('sort').optional()
    .matches(/^[a-z_]+:(ASC|DESC)(,[a-z_]+:(ASC|DESC))*$/i)
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