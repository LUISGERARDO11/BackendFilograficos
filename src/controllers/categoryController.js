const { Op } = require('sequelize');
const { body, validationResult } = require('express-validator');
const Category = require('../models/Category');
const loggerUtils = require('../utils/loggerUtils');
const { uploadCategoryImageToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');

// Validación para color hexadecimal
const isHexColor = (value) => /^#([0-9A-F]{6}|[0-9A-F]{8})$/i.test(value);

// Validación para URL
const isValidUrl = (value) => /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(value);

// Crear nueva categoría
exports.createCategory = [
  body('name').isString().trim().notEmpty().withMessage('El nombre es obligatorio.'),
  body('description').optional().isString(),
  body('color_fondo').optional().custom((value) => {
    if (value && !isHexColor(value)) {
      throw new Error('El color de fondo debe ser un valor hexadecimal válido (ej. #FF5733 o #FF5733AA).');
    }
    return true;
  }),
  body('imagen_url').optional().custom((value) => {
    if (value && !isValidUrl(value)) {
      throw new Error('La URL de la imagen debe ser válida (http o https).');
    }
    return true;
  }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name, description, color_fondo, imagen_url } = req.body;

      // Verificar si la categoría ya existe
      const existingCategory = await Category.findOne({ where: { name } });
      if (existingCategory) {
        return res.status(400).json({ message: 'La categoría ya existe.' });
      }

      let final_imagen_url = null;
      let public_id = null;

      // Priorizar imagen_url sobre categoryImage
      if (imagen_url) {
        final_imagen_url = imagen_url;
      } else if (req.file) {
        const uploadResult = await uploadCategoryImageToCloudinary(req.file.buffer, name);
        final_imagen_url = uploadResult.secure_url;
        public_id = uploadResult.public_id;
      }

      const newCategory = await Category.create({
        name,
        description,
        color_fondo,
        imagen_url: final_imagen_url,
        public_id
      });

      loggerUtils.logUserActivity(req.user.user_id, 'create', `Categoría creada: ${name}`);
      res.status(201).json({ message: 'Categoría creada exitosamente.', category: newCategory });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear categoría', error: error.message });
    }
  }
];

// Obtener todas las categorías activas
exports.getCategories = async (req, res) => {
  try {
    const categories = await Category.findAll({
      where: { active: true },
      attributes: ['category_id', 'name', 'imagen_url', 'color_fondo'],
      order: [['created_at', 'DESC']]
    });

    res.status(200).json(categories);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// Obtener todas las categorías
exports.getAllCategories = async (req, res) => {
  try {
    const { page: pageParam, pageSize: pageSizeParam, active, name, sortBy, sortOrder } = req.query;
    const page = parseInt(pageParam) || 1;
    const pageSize = parseInt(pageSizeParam) || 10;

    // Validación de parámetros de paginación
    if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
      return res.status(400).json({
        message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos'
      });
    }

    // Construir el objeto where dinámicamente
    const whereClause = {};

    // Filtro por estado (active)
    if (active !== undefined) {
      let activeValue;
      if (active === 'true') {
        activeValue = true;
      } else if (active === 'false') {
        activeValue = false;
      } else {
        activeValue = undefined;
      }
      whereClause.active = activeValue;
    }

    // Filtro por nombre (búsqueda parcial con LIKE)
    if (name) {
      whereClause.name = { [Op.like]: `%${name}%` };
    }

    const validSortFields = ['name', 'created_at'];
    const order = sortBy && validSortFields.includes(sortBy)
      ? [[sortBy, sortOrder === 'ASC' ? 'ASC' : 'DESC']]
      : [['created_at', 'DESC']];

    const { count, rows: categories } = await Category.findAndCountAll({
      where: whereClause,
      attributes: ['category_id', 'name', 'description', 'active', 'imagen_url', 'color_fondo'],
      order,
      limit: pageSize,
      offset: (page - 1) * pageSize
    });

    res.status(200).json({
      categories,
      total: count,
      page,
      pageSize
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener categorías', error: error.message });
  }
};

// Obtener una categoría por su ID
exports.getCategoryById = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id, {
      attributes: ['category_id', 'name', 'description', 'active', 'imagen_url', 'color_fondo']
    });
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada.' });
    }
    res.status(200).json(category);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener la categoría', error: error.message });
  }
};

// Eliminación lógica de categoría
exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findByPk(req.params.id);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    // Eliminar la imagen de Cloudinary si existe
    if (category.public_id) {
      await deleteFromCloudinary(category.public_id);
    }

    await category.update({ active: false, imagen_url: null, public_id: null });
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Categoría desactivada: ${category.name}`);
    res.status(200).json({ message: 'Categoría desactivada correctamente.' });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al desactivar la categoría', error: error.message });
  }
};

// Actualizar categoría por ID
exports.updateCategory = [
  body('name').optional().isString().trim(),
  body('description').optional().isString(),
  body('color_fondo').optional().custom((value) => {
    if (value && !isHexColor(value)) {
      throw new Error('El color de fondo debe ser un valor hexadecimal válido (ej. #FF5733 o #FF5733AA).');
    }
    return true;
  }),
  body('imagen_url').optional().custom((value) => {
    if (value && !isValidUrl(value)) {
      throw new Error('La URL de la imagen debe ser válida (http o https).');
    }
    return true;
  }),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const category = await Category.findByPk(req.params.id);
      if (!category) {
        return res.status(404).json({ message: 'Categoría no encontrada.' });
      }

      const { name, description, color_fondo, imagen_url, removeImage } = req.body;
      let final_imagen_url = category.imagen_url;
      let final_public_id = category.public_id;

      // Priorizar imagen_url sobre categoryImage y removeImage
      if (imagen_url) {
        // Si la imagen anterior era de Cloudinary, eliminarla
        if (category.public_id) {
          await deleteFromCloudinary(category.public_id);
        }
        final_imagen_url = imagen_url;
        final_public_id = null; // URL externa no tiene public_id
      } else if (req.file) {
        // Si la imagen anterior era de Cloudinary, eliminarla
        if (category.public_id) {
          await deleteFromCloudinary(category.public_id);
        }
        // Subir la nueva imagen a Cloudinary
        const uploadResult = await uploadCategoryImageToCloudinary(req.file.buffer, name || category.name);
        final_imagen_url = uploadResult.secure_url;
        final_public_id = uploadResult.public_id;
      } else if (removeImage === 'true') {
        // Eliminar la imagen actual
        if (category.public_id) {
          await deleteFromCloudinary(category.public_id);
        }
        final_imagen_url = null;
        final_public_id = null;
      }

      // Actualizar los campos de la categoría
      if (name) category.name = name;
      if (description !== undefined) category.description = description;
      category.color_fondo = color_fondo !== undefined ? color_fondo : category.color_fondo;
      category.imagen_url = final_imagen_url;
      category.public_id = final_public_id;

      await category.save();
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Categoría actualizada: ${category.name}`);
      res.status(200).json({ message: 'Categoría actualizada correctamente.', category });

    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la categoría', error: error.message });
    }
  }
];