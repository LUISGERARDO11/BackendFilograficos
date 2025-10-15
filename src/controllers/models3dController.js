const { body, validationResult } = require('express-validator');
const Models3d = require('../models/Models3d');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

// Crear un nuevo modelo 3D
exports.createModel3d = [
  body('product_name').isString().trim().notEmpty().withMessage('El nombre del producto es obligatorio.'),
  body('description').optional().isString().trim(),
  body('model_url').isURL().withMessage('La URL del modelo es obligatoria y debe ser válida.'),
  body('preview_image_url').optional({ nullable: true }).isURL().withMessage('La URL de la imagen de vista previa debe ser válida.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      loggerUtils.logCriticalError(new Error('Errores de validación al crear el modelo 3D.'));
      return res.status(400).json({ errors: errors.array() });
    }

    const { product_name, description, model_url, preview_image_url } = req.body;
    const userId = req.user?.user_id;

    try {
      const existingModel = await Models3d.findOne({ where: { product_name } });
      if (existingModel) {
        loggerUtils.logUserActivity(userId, 'create', 'Intento de crear un modelo 3D con nombre duplicado.');
        return res.status(400).json({ message: 'El nombre de este producto 3D ya existe.' });
      }

      const newModel = await Models3d.create({
        product_name,
        description,
        model_url,
        preview_image_url
      });

      loggerUtils.logUserActivity(userId, 'create', `Modelo 3D creado: ${product_name}.`);
      res.status(201).json({ message: 'Modelo 3D creado exitosamente.', model: newModel });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear el modelo 3D.', error: error.message });
    }
  },
];

// Obtener un modelo 3D por ID
exports.getModel3dById = async (req, res) => {
  const id = parseInt(req.params.id); // Convertir a número

  try {
    const model = await Models3d.findByPk(id);
    if (!model) {
      loggerUtils.logUserActivity(req.user?.user_id, 'view', `Intento fallido de obtener modelo 3D por ID: ${id}.`);
      return res.status(404).json({ message: 'Modelo 3D no encontrado.' });
    }

    loggerUtils.logUserActivity(req.user?.user_id, 'view', `Obtenido modelo 3D: ${model.product_name}.`);
    res.status(200).json({ model });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el modelo 3D.', error: error.message });
  }
};

// Obtener todos los modelos 3D
exports.getAllModels3d = async (req, res) => {
  try {
    const models = await Models3d.findAll({
      attributes: ['id', 'product_name', 'description', 'model_url', 'preview_image_url'],
      order: [['product_name', 'ASC']],
    });

    loggerUtils.logUserActivity(req.user?.user_id, 'view', 'Obtenidos todos los modelos 3D.');

    res.status(200).json(models);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener los modelos 3D.', error: error.message });
  }
};

// Actualizar un modelo 3D
exports.updateModel3d = [
  body('product_name').optional().isString().trim().notEmpty().withMessage('El nombre del producto no puede estar vacío.'),
  body('description').optional().isString().trim(),
  body('model_url').optional().isURL().withMessage('La URL del modelo debe ser válida.'),
  body('preview_image_url').optional({ nullable: true }).isURL().withMessage('La URL de la imagen de vista previa debe ser válida.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      loggerUtils.logCriticalError(new Error('Errores de validación al actualizar el modelo 3D.'));
      return res.status(400).json({ errors: errors.array() });
    }

    const id = parseInt(req.params.id); // Convertir a número
    const userId = req.user?.user_id;
    const { product_name, description, model_url, preview_image_url } = req.body;

    try {
      const [updatedRows] = await Models3d.update(
        { product_name, description, model_url, preview_image_url },
        {
          where: { id },
          returning: true,
        }
      );

      if (updatedRows === 0) {
        loggerUtils.logUserActivity(userId, 'update', `Intento fallido de actualizar modelo 3D por ID: ${id}.`);
        return res.status(404).json({ message: 'Modelo 3D no encontrado.' });
      }

      const updatedModel = await Models3d.findByPk(id);
      loggerUtils.logUserActivity(userId, 'update', `Modelo 3D actualizado: ${updatedModel.product_name}.`);
      res.status(200).json({ message: 'Modelo 3D actualizado exitosamente.', model: updatedModel });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar el modelo 3D.', error: error.message });
    }
  },
];

// Eliminar un modelo 3D
exports.deleteModel3d = async (req, res) => {
  const id = parseInt(req.params.id); // Convertir a número
  const userId = req.user?.user_id;

  try {
    const deletedRows = await Models3d.destroy({ where: { id } });

    if (deletedRows === 0) {
      loggerUtils.logUserActivity(userId, 'delete', `Intento fallido de eliminar modelo 3D por ID: ${id}.`);
      return res.status(404).json({ message: 'Modelo 3D no encontrado.' });
    }

    loggerUtils.logUserActivity(userId, 'delete', `Modelo 3D eliminado exitosamente por ID: ${id}.`);
    res.status(200).json({ message: 'Modelo 3D eliminado exitosamente.' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar el modelo 3D.', error: error.message });
  }
};