/* The above code is a set of controller functions for managing company information in a Node.js
application. Here is a summary of what each function does: */
const cloudinaryService = require('../services/cloudinaryService');
const { Company, SocialMedia } = require('../models/Associations');
const { body, validationResult } = require('express-validator');
const loggerUtils = require('../utils/loggerUtils');

// Helper function to upload logo
const uploadLogoIfPresent = async (file) => {
  if (!file) return null;
  return await cloudinaryService.uploadToCloudinary(file.buffer);
};

// Helper function to check if a company exists
const checkExistingCompany = async () => {
  return await Company.findOne();
};

// Helper function to update company fields
const updateCompanyFields = (companyInfo, fields) => {
  const {
    name, slogan, page_title, address_street, address_city, address_state,
    address_postal_code, address_country, phone_number, phone_extension, email
  } = fields;

  const updates = {
    ...(name && { name }),
    ...(slogan && { slogan }),
    ...(page_title && { page_title }),
    ...(address_street && { address_street }),
    ...(address_city && { address_city }),
    ...(address_state && { address_state }),
    ...(address_postal_code && { address_postal_code }),
    ...(address_country && { address_country }),
    ...(phone_number && { phone_number }),
    ...(phone_extension && { phone_extension }),
    ...(email && { email }),
  };

  Object.assign(companyInfo, updates);
};

// Create new company (unchanged)
exports.createCompany = [
  body('name').isString().trim().escape().withMessage('El nombre es requerido.'),
  body('slogan').optional().isString().isLength({ max: 100 }).trim().escape().withMessage('El eslogan debe ser un texto válido y no exceder los 100 caracteres.'),
  body('page_title').optional().isString().isLength({ max: 60 }).trim().escape().withMessage('El título de la página no debe exceder los 60 caracteres.'),
  body('address_street').optional().isString().trim().escape().withMessage('La calle debe ser un texto válido.'),
  body('address_city').optional().isString().trim().escape().withMessage('La ciudad debe ser un texto válido.'),
  body('address_state').optional().isString().trim().escape().withMessage('El estado debe ser un texto válido.'),
  body('address_postal_code').optional().isString().trim().escape().withMessage('El código postal debe ser un texto válido.'),
  body('address_country').optional().isString().trim().escape().withMessage('El país debe ser un texto válido.'),
  body('phone_number').optional().matches(/^\d{10}$/).withMessage('El número de teléfono debe tener 10 dígitos.'),
  body('phone_extension').optional().isString().trim().escape().withMessage('La extensión debe ser un número válido.'),
  body('email').isEmail().normalizeEmail().withMessage('El correo electrónico es obligatorio y debe ser válido.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      name, slogan, page_title, address_street, address_city, address_state,
      address_postal_code, address_country, phone_number, phone_extension, email
    } = req.body;

    try {
      const existingCompany = await checkExistingCompany();
      if (existingCompany) {
        return res.status(400).json({ message: 'La información de la empresa ya existe.' });
      }

      const logoUrl = await uploadLogoIfPresent(req.file);

      const newCompany = await Company.create({
        name,
        logo: logoUrl,
        slogan,
        page_title,
        address_street,
        address_city,
        address_state,
        address_postal_code,
        address_country,
        phone_number,
        phone_extension,
        email
      });

      loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'create', 'Empresa creada exitosamente.');
      res.status(201).json({ message: 'Empresa creada exitosamente.', company: newCompany });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear la empresa.', error: error.message });
    }
  }
];

// Update company info (refactored)
exports.updateCompanyInfo = [
  body('name').optional().isString().trim().escape().withMessage('El nombre debe ser un texto válido.'),
  body('slogan').optional().isString().isLength({ max: 100 }).trim().escape().withMessage('El eslogan no debe exceder los 100 caracteres.'),
  body('page_title').optional().isString().isLength({ max: 60 }).trim().escape().withMessage('El título de la página no debe exceder los 60 caracteres.'),
  body('address_street').optional().isString().trim().escape().withMessage('La calle debe ser un texto válido.'),
  body('address_city').optional().isString().trim().escape().withMessage('La ciudad debe ser un texto válido.'),
  body('address_state').optional().isString().trim().escape().withMessage('El estado debe ser un texto válido.'),
  body('address_postal_code').optional().isString().trim().escape().withMessage('El código postal debe ser un texto válido.'),
  body('address_country').optional().isString().trim().escape().withMessage('El país debe ser un texto válido.'),
  body('phone_number').optional().matches(/^\d{10}$/).withMessage('El número de teléfono debe tener 10 dígitos.'),
  body('phone_extension').optional().isString().trim().escape().withMessage('La extensión debe ser un número válido.'),
  body('email').optional().isEmail().normalizeEmail().withMessage('El correo electrónico debe ser válido.'),

  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const fields = req.body;

    try {
      const companyInfo = await checkExistingCompany();
      if (!companyInfo) {
        return res.status(404).json({ message: 'La información de la empresa no se encontró.' });
      }

      const logoUrl = await uploadLogoIfPresent(req.file);
      if (logoUrl) companyInfo.logo = logoUrl;

      updateCompanyFields(companyInfo, fields);

      const updatedCompany = await companyInfo.save();

      loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'update', 'Información de la empresa actualizada exitosamente.');
      res.status(200).json({ message: 'Información de la empresa actualizada exitosamente.', company: updatedCompany });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al actualizar la información de la empresa.', error: error.message });
    }
  }
];

// Obtener la información de la empresa (incluye redes sociales)
exports.getCompanyInfo = async (req, res) => {
    try {
        const companyInfo = await Company.findOne({
            where: { active: true },
            attributes: { exclude: ['active'] },
            include: [{ model: SocialMedia, attributes: ['social_media_id', 'name', 'link'], where: { active: true } }]
        });

        if (!companyInfo) {
            return res.status(404).json({ message: 'La información de la empresa no se encontró.' });
        }

        res.status(200).json({ company: companyInfo });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener la información de la empresa.', error: error.message });
    }
};

// Agregar una red social
exports.addSocialMedia = [
    body('name').isString().trim().escape().withMessage('El nombre de la red social es requerido.'),
    body('link').isURL().withMessage('El enlace debe ser una URL válida.'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, link } = req.body;

        try {
            const company = await Company.findOne({ where: { active: true } });
            if (!company) {
                return res.status(404).json({ message: 'No se encontró una empresa activa.' });
            }

            const socialMedia = await SocialMedia.create({
                company_id: company.company_id,
                name,
                link
            });

            loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'create', `Red social ${name} agregada exitosamente.`);
            res.status(201).json({ message: `Red social ${name} agregada exitosamente.`, socialMedia });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error al agregar la red social.', error: error.message });
        }
    }
];

// Actualizar una red social
exports.updateSocialMedia = [
    body('social_media_id').isInt().withMessage('El ID de la red social debe ser un número entero.'),
    body('name').optional().isString().trim().escape().withMessage('El nombre de la red social debe ser un texto válido.'),
    body('link').optional().isURL().withMessage('El enlace debe ser una URL válida.'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { social_media_id, name, link } = req.body;

        try {
            const socialMedia = await SocialMedia.findByPk(social_media_id);
            if (!socialMedia) {
                return res.status(404).json({ message: 'Red social no encontrada.' });
            }

            if (name) socialMedia.name = name;
            if (link) socialMedia.link = link;

            const updatedSocialMedia = await socialMedia.save();

            loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'update', `Red social ${socialMedia.name} actualizada exitosamente.`);
            res.status(200).json({ message: `Red social ${socialMedia.name} actualizada exitosamente.`, socialMedia: updatedSocialMedia });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error al actualizar la red social.', error: error.message });
        }
    }
];

// Eliminar una red social (borrado lógico)
exports.deleteSocialMedia = async (req, res) => {
    const { social_media_id } = req.params;

    try {
        const socialMedia = await SocialMedia.findByPk(social_media_id);
        if (!socialMedia) {
            return res.status(404).json({ message: 'Red social no encontrada.' });
        }

        socialMedia.active = false;
        await socialMedia.save();

        loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'delete', `Red social ${socialMedia.name} eliminada exitosamente.`);
        res.status(200).json({ message: `Red social ${socialMedia.name} eliminada exitosamente.` });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al eliminar la red social.', error: error.message });
    }
};

// Borrado lógico de la empresa
exports.deleteCompany = async (req, res) => {
    try {
        const company = await Company.findOne();
        if (!company) {
            return res.status(404).json({ message: 'La empresa no se encontró.' });
        }

        company.active = false;
        await company.save();

        loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'delete', 'Información de la empresa marcada como eliminada.');
        res.status(200).json({ message: 'La empresa ha sido eliminada lógicamente.' });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al eliminar la empresa.', error: error.message });
    }
};

// Restaurar la empresa
exports.restoreCompany = async (req, res) => {
    try {
        const company = await Company.findOne({ where: { active: false } });
        if (!company) {
            return res.status(404).json({ message: 'No se encontró una empresa inactiva para restaurar.' });
        }

        company.active = true;
        await company.save();

        loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'restore', 'Información de la empresa restaurada.');
        res.status(200).json({ message: 'La empresa ha sido restaurada exitosamente.' });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al restaurar la empresa.', error: error.message });
    }
};