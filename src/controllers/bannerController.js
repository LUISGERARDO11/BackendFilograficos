const { body, param, validationResult } = require('express-validator');
const { Banner, SystemConfig } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { uploadBannerToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');

// Crear banners (subir de 1 a 5 imágenes)
exports.createBanners = [
  body('title').trim().notEmpty().withMessage('El título es obligatorio'),
  body('description').optional().trim().isString().withMessage('La descripción debe ser una cadena de texto'),
  body('cta_text').optional().trim().isString().withMessage('El texto del CTA debe ser una cadena de texto'),
  body('cta_link').optional().trim().isString().withMessage('El enlace del CTA debe ser una cadena de texto'),
  body('is_active').optional().isBoolean().withMessage('El estado debe ser un valor booleano'),

  async (req, res) => {
    const userId = req.user.user_id;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const { title, description, cta_text, cta_link, is_active } = req.body;

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ success: false, message: 'Debe subir al menos una imagen para el banner' });
      }
      if (req.files.length > 5) {
        return res.status(400).json({ success: false, message: 'No se pueden subir más de 5 imágenes a la vez' });
      }

      const totalBanners = await Banner.count();
      const newBannersCount = req.files.length;
      if (totalBanners + newBannersCount > 5) {
        return res.status(400).json({
          success: false,
          message: `No se pueden registrar más de 5 banners en total. Actualmente hay ${totalBanners} banners`
        });
      }

      const banners = [];
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const result = await uploadBannerToCloudinary(file.buffer, file.originalname);
        const order = totalBanners + i + 1;

        const banner = await Banner.create({
          title,
          description: description || null,
          image_url: result.secure_url,
          public_id: result.public_id,
          cta_text: cta_text || null,
          cta_link: cta_link || null,
          order,
          is_active: is_active === 'true' || is_active === true || false,
          created_by: userId
        });

        banners.push(banner);
      }

      loggerUtils.logUserActivity(userId, 'create_banners', `Se crearon ${banners.length} banners por el usuario ${userId}`);
      res.status(201).json({
        success: true,
        message: 'Banners creados exitosamente',
        banners
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al crear los banners',
        error: error.message
      });
    }
  }
];

// Obtener todos los banners (para admin)
exports.getAllBanners = async (req, res) => {
  try {
    const banners = await Banner.findAll({
      order: [['order', 'ASC']],
      attributes: { exclude: ['created_by', 'updated_by'] }
    });

    res.status(200).json({
      success: true,
      banners
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los banners',
      error: error.message
    });
  }
};

// Obtener banners activos (para frontend público)
exports.getActiveBanners = async (req, res) => {
  try {
    const config = await SystemConfig.findOne(); // Suponiendo una sola fila de configuración
    if (!config.show_banners_to_users) {
      return res.status(200).json({
        success: true,
        banners: []
      });
    }

    const banners = await Banner.findAll({
      where: { is_active: true },
      order: [['order', 'ASC']],
      attributes: ['banner_id', 'title', 'description', 'image_url', 'cta_text', 'cta_link', 'order']
    });

    res.status(200).json({
      success: true,
      banners
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener los banners activos',
      error: error.message
    });
  }
};

// Actualizar un banner
exports.updateBanner = [
  param('bannerId').isInt({ min: 1 }).withMessage('El ID del banner debe ser un número entero positivo'),
  body('title').optional().trim().notEmpty().withMessage('El título no puede estar vacío'),
  body('description').optional().trim().isString().withMessage('La descripción debe ser una cadena de texto'),
  body('cta_text').optional().trim().isString().withMessage('El texto del CTA debe ser una cadena de texto'),
  body('cta_link').optional().trim().isString().withMessage('El enlace del CTA debe ser una cadena de texto'),
  body('is_active').optional().isBoolean().withMessage('El estado debe ser un valor booleano'),
  body('order').optional().isInt({ min: 1, max: 5 }).withMessage('El orden debe ser un número entre 1 y 5'),

  async (req, res) => {
    const { bannerId } = req.params;
    const userId = req.user.user_id;
    const { title, description, cta_text, cta_link, is_active, order } = req.body;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const banner = await Banner.findByPk(bannerId);
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner no encontrado' });
      }

      if (req.files && req.files.length > 1) {
        return res.status(400).json({ success: false, message: 'Solo se puede subir una imagen al actualizar un banner' });
      }

      if (req.files && req.files.length === 1) {
        await deleteFromCloudinary(banner.public_id);
        const result = await uploadBannerToCloudinary(req.files[0].buffer, req.files[0].originalname);
        banner.image_url = result.secure_url;
        banner.public_id = result.public_id;
      }

      if (title) banner.title = title;
      if (description !== undefined) banner.description = description;
      if (cta_text !== undefined) banner.cta_text = cta_text;
      if (cta_link !== undefined) banner.cta_link = cta_link;
      if (is_active !== undefined) banner.is_active = is_active === 'true' || is_active === true;
      if (order !== undefined) banner.order = parseInt(order, 10);

      banner.updated_by = userId;
      await banner.save();

      loggerUtils.logUserActivity(userId, 'update_banner', `Banner actualizado: ID ${bannerId}`);
      res.status(200).json({
        success: true,
        message: 'Banner actualizado exitosamente',
        banner
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar el banner',
        error: error.message
      });
    }
  }
];

// Eliminar un banner
exports.deleteBanner = [
  param('bannerId').isInt({ min: 1 }).withMessage('El ID del banner debe ser un número entero positivo'),

  async (req, res) => {
    const { bannerId } = req.params;
    const userId = req.user.user_id;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const banner = await Banner.findByPk(bannerId);
      if (!banner) {
        return res.status(404).json({ success: false, message: 'Banner no encontrado' });
      }

      await deleteFromCloudinary(banner.public_id);
      await banner.destroy();

      const remainingBanners = await Banner.findAll({ order: [['order', 'ASC']] });
      for (let i = 0; i < remainingBanners.length; i++) {
        remainingBanners[i].order = i + 1;
        await remainingBanners[i].save();
      }

      loggerUtils.logUserActivity(userId, 'delete_banner', `Banner eliminado: ID ${bannerId}`);
      res.status(200).json({
        success: true,
        message: 'Banner eliminado exitosamente'
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar el banner',
        error: error.message
      });
    }
  }
];

// Nuevo método para controlar visibilidad de banners
exports.toggleBannersVisibility = [
  body('show_banners_to_users').isBoolean().withMessage('El valor debe ser un booleano'),

  async (req, res) => {
    const userId = req.user.user_id;
    const { show_banners_to_users } = req.body;

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, message: 'Errores de validación', errors: errors.array() });
      }

      const config = await SystemConfig.findOne();
      if (!config) {
        return res.status(404).json({ success: false, message: 'Configuración del sistema no encontrada' });
      }

      config.show_banners_to_users = show_banners_to_users;
      await config.save();

      loggerUtils.logUserActivity(userId, 'toggle_banners_visibility', `Visibilidad de banners cambiada a ${show_banners_to_users} por el usuario ${userId}`);
      res.status(200).json({
        success: true,
        message: `Banners ahora ${show_banners_to_users ? 'visibles' : 'ocultos'} para los usuarios`,
        show_banners_to_users
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar la visibilidad de los banners',
        error: error.message
      });
    }
  }
];

// Obtener estado actual de visibilidad de banners (para admin)
exports.getBannersVisibility = async (req, res) => {
  try {
    const config = await SystemConfig.findOne();
    if (!config) {
      return res.status(404).json({ success: false, message: 'Configuración del sistema no encontrada' });
    }

    res.status(200).json({
      success: true,
      show_banners_to_users: config.show_banners_to_users
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener la visibilidad de los banners',
      error: error.message
    });
  }
};