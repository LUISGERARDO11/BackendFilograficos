const { body, param, validationResult } = require('express-validator');
const { Category, ProductAttribute,ProductAttributeValue, CategoryAttributes } = require('../models/Associations');
const { Op } = require('sequelize');
const loggerUtils = require('../utils/loggerUtils');

// Obtener cantidad de atributos por categorías (solo categorías activas y atributos no eliminados)
exports.getAttributeCountByCategory = async (req, res) => {
  try {
    const counts = await CategoryAttributes.findAll({
      attributes: [
        'category_id',
        [CategoryAttributes.sequelize.fn('COUNT', CategoryAttributes.sequelize.col('CategoryAttributes.attribute_id')), 'count'] // Especificar tabla
      ],
      group: ['category_id'],
      include: [
        {
          model: Category,
          as: 'category',
          attributes: ['category_id', 'name'],
          where: { active: true } // Filtrar solo categorías activas
        },
        {
          model: ProductAttribute,
          as: 'attribute',
          attributes: [],
          where: { is_deleted: false } // Filtrar solo atributos no eliminados
        }
      ],
      where: {
        attribute_id: {
          [Op.ne]: null
        }
      }
    });

    const result = counts.map(count => ({
      category_id: count.category_id,
      category_name: count.category.name,
      attribute_count: count.get('count')
    }));

    res.status(200).json(result);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la cantidad de atributos por categoría', error: error.message });
  }
};

// Obtener todos los atributos de acuerdo a una categoría (con paginación)
exports.getAttributesByCategory = async (req, res) => {
    const { category_id } = req.params;
    const { page: pageParam, pageSize: pageSizeParam } = req.query;
    
    // Configuración de paginación
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;
  
    try {
      // Validación de parámetros de paginación
      if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
        return res.status(400).json({ 
          message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos' 
        });
      }
  
      // Consulta con paginación usando findAndCountAll
      const { count, rows: attributes } = await CategoryAttributes.findAndCountAll({
        where: { category_id },
        include: [{
          model: ProductAttribute,
          as: 'attribute',
          where: { is_deleted: false },
          attributes: ['attribute_id', 'attribute_name', 'data_type', 'allowed_values']
        }],
        limit: pageSize,
        offset: (page - 1) * pageSize
      });
  
      // Mapear los resultados para el formato deseado
      const result = attributes.map(attr => ({
        attribute_id: attr.attribute.attribute_id,
        attribute_name: attr.attribute.attribute_name,
        data_type: attr.attribute.data_type,
        allowed_values: attr.attribute.allowed_values
      }));
  
      // Respuesta con datos paginados
      res.status(200).json({
        data: result, // Lista de atributos
        total: count, // Total de atributos encontrados
        page,         // Página actual
        pageSize      // Tamaño de la página
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener los atributos por categoría', error: error.message });
    }
  };

// Crear un atributo
exports.createAttribute = [
  body('attribute_name').trim().notEmpty().withMessage('El nombre del atributo es obligatorio').escape(),
  body('data_type').isIn(['texto', 'numero', 'boolean', 'lista']).withMessage('El tipo de dato no es válido'),
  body('allowed_values').optional({ nullable: true, checkFalsy: true }).isString().withMessage('Los valores permitidos deben ser una cadena de texto'),
  body('category_id').isInt().withMessage('El ID de la categoría debe ser un número entero'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { attribute_name, data_type, allowed_values, category_id } = req.body;

    try {
      // Crear el atributo
      const newAttribute = await ProductAttribute.create({
        attribute_name,
        data_type,
        allowed_values: allowed_values || null // Si es vacío o null, se guarda como null
      });

      // Asociar el atributo a la categoría
      await CategoryAttributes.create({
        category_id,
        attribute_id: newAttribute.attribute_id
      });

      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'create', `Atributo creado: ${newAttribute.attribute_id}`);
      res.status(201).json({ message: 'Atributo creado exitosamente.', attribute: newAttribute });
    } catch (error) {
      // Registrar el error de validación de Sequelize
      if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
        loggerUtils.logCriticalError(error.errors); // Registrar los errores de validación
        return res.status(400).json({
          message: 'Error de validación al crear el atributo',
          errors: error.errors.map(err => ({
            field: err.path,
            message: err.message
          }))
        });
      }

      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear el atributo', error: error.message });
    }
  }
];

// Actualizar un atributo
exports.updateAttribute = [
  param('id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('attribute_name').optional().trim().notEmpty().withMessage('El nombre del atributo no puede estar vacío').escape(),
  body('data_type').optional().isIn(['texto', 'numero', 'boolean', 'lista']).withMessage('El tipo de dato no es válido'),
  body('allowed_values').optional({ nullable: true, checkFalsy: true }).isString().withMessage('Los valores permitidos deben ser una cadena de texto'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { attribute_name, data_type, allowed_values, category_id } = req.body;

    try {
      const attribute = await ProductAttribute.findByPk(id);
      if (!attribute || attribute.is_deleted) {
        return res.status(404).json({ message: 'Atributo no encontrado o ya está eliminado' });
      }

      // Validar cambios en allowed_values si es tipo "lista"
      if (allowed_values !== undefined && attribute.data_type === 'lista') {
        const currentValues = await ProductAttributeValue.findAll({
          where: { attribute_id: id },
          attributes: ['value'],
          raw: true
        });
        const usedValues = [...new Set(currentValues.map(v => v.value))]; // Valores únicos usados por productos
        const newAllowedValues = allowed_values ? allowed_values.split(',') : [];

        // Verificar si algún valor usado ya no está en la nueva lista
        const invalidValues = usedValues.filter(val => !newAllowedValues.includes(val));
        if (invalidValues.length > 0) {
          return res.status(400).json({
            message: `No se puede actualizar los valores permitidos. Los siguientes valores están en uso y no están en la nueva lista: ${invalidValues.join(', ')}`,
            invalid_values: invalidValues
          });
        }
      }

      // Actualizar los campos proporcionados
      if (attribute_name !== undefined) attribute.attribute_name = attribute_name;
      if (data_type !== undefined) attribute.data_type = data_type;
      if (allowed_values !== undefined) attribute.allowed_values = allowed_values || null;

      await attribute.save();

      // Manejar la relación con category_id si se proporciona
      if (category_id !== undefined) {
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
          return res.status(400).json({ message: 'La categoría especificada no existe' });
        }
        // Actualizar la relación en CategoryAttributes (eliminar y recrear)
        await CategoryAttributes.destroy({ where: { attribute_id: id } });
        await CategoryAttributes.create({ category_id, attribute_id: id });
      }

      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'update', `Atributo actualizado: ${attribute.attribute_name} (ID: ${id})`);
      res.status(200).json({ message: 'Atributo actualizado exitosamente', attribute });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el atributo', error: error.message });
    }
  }
];

// Eliminar lógicamente un atributo
exports.deleteAttribute = [
  param('id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;

    try {
      const attribute = await ProductAttribute.findByPk(id);
      if (!attribute || attribute.is_deleted) {
        return res.status(404).json({ message: 'Atributo no encontrado o ya está eliminado' });
      }

      // Actualizar a is_deleted: true para eliminación lógica
      const [affectedRows] = await ProductAttribute.update(
        { is_deleted: true },
        { where: { attribute_id: id, is_deleted: false } }
      );

      if (affectedRows === 0) {
        return res.status(404).json({ message: 'Atributo no encontrado o ya está eliminado' });
      }

      // Contar productos afectados para notificación
      const affectedProducts = await ProductAttributeValue.count({ where: { attribute_id: id } });

      // Eliminar relación en CategoryAttributes (no afecta ProductAttributeValue)
      await CategoryAttributes.destroy({ where: { attribute_id: id } });

      loggerUtils.logUserActivity(
        req.user?.user_id || 'system',
        'delete',
        `Atributo eliminado lógicamente: ${attribute.attribute_name} (ID: ${id}). Productos afectados: ${affectedProducts}`
      );
      res.status(200).json({
        message: 'Atributo eliminado lógicamente exitosamente',
        affected_products: affectedProducts
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al eliminar el atributo', error: error.message });
    }
  }
];