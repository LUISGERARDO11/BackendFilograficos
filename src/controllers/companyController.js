/* The above code is a set of controller functions for managing company information in a Node.js
application. Here is a summary of what each function does: */
const cloudinaryService = require('../services/cloudinaryService');
const Company = require('../models/Company');
const { body, validationResult } = require('express-validator');
const loggerUtils = require('../utils/loggerUtils');

// Crear nueva empresa
exports.createCompany = [
    // Validar y sanitizar las entradas
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

    body('facebook').optional().isURL().withMessage('La URL de Facebook debe ser válida.'),
    body('twitter').optional().isURL().withMessage('La URL de Twitter debe ser válida.'),
    body('linkedin').optional().isURL().withMessage('La URL de LinkedIn debe ser válida.'),
    body('instagram').optional().isURL().withMessage('La URL de Instagram debe ser válida.'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, slogan, page_title, address_street, address_city, address_state, address_postal_code, address_country, phone_number, phone_extension, email, facebook, twitter, linkedin, instagram } = req.body;
        let logoUrl = null;

        try {
            // Subir el logo a Cloudinary si está presente
            if (req.file) {
                logoUrl = await cloudinaryService.uploadToCloudinary(req.file.buffer);
            }

            // Verificar si ya existe una empresa
            const existingCompany = await Company.findOne();
            if (existingCompany) {
                return res.status(400).json({ message: 'La información de la empresa ya existe.' });
            }

            // Crear una nueva empresa
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
                email,
                facebook,
                twitter,
                linkedin,
                instagram
            });

            // Registrar la actividad de creación de la empresa
            loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'create', 'Empresa creada exitosamente.');

            // Responder con éxito
            res.status(201).json({ message: 'Empresa creada exitosamente.', company: newCompany });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error al crear la empresa.', error: error.message });
        }
    }
];

// Actualizar la información de la empresa
exports.updateCompanyInfo = [
    // Validar y sanitizar las entradas
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

    body('facebook').optional().isURL().withMessage('La URL de Facebook debe ser válida.'),
    body('twitter').optional().isURL().withMessage('La URL de Twitter debe ser válida.'),
    body('linkedin').optional().isURL().withMessage('La URL de LinkedIn debe ser válida.'),
    body('instagram').optional().isURL().withMessage('La URL de Instagram debe ser válida.'),

    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { name, slogan, page_title, address_street, address_city, address_state, address_postal_code, address_country, phone_number, phone_extension, email, facebook, twitter, linkedin, instagram } = req.body;

        try {
            // Buscar la información de la empresa
            const companyInfo = await Company.findOne();

            if (!companyInfo) {
                return res.status(404).json({ message: 'La información de la empresa no se encontró.' });
            }

            // Subir el logo actualizado a Cloudinary si está presente en la solicitud
            if (req.file) {
                const logoUrl = await cloudinaryService.uploadToCloudinary(req.file.buffer);
                companyInfo.logo = logoUrl;
            }

            // Actualizar los campos con los valores proporcionados en la solicitud
            if (name) companyInfo.name = name;
            if (slogan) companyInfo.slogan = slogan;
            if (page_title) companyInfo.page_title = page_title;
            if (address_street) companyInfo.address_street = address_street;
            if (address_city) companyInfo.address_city = address_city;
            if (address_state) companyInfo.address_state = address_state;
            if (address_postal_code) companyInfo.address_postal_code = address_postal_code;
            if (address_country) companyInfo.address_country = address_country;
            if (phone_number) companyInfo.phone_number = phone_number;
            if (phone_extension) companyInfo.phone_extension = phone_extension;
            if (email) companyInfo.email = email;
            if (facebook) companyInfo.facebook = facebook;
            if (twitter) companyInfo.twitter = twitter;
            if (linkedin) companyInfo.linkedin = linkedin;
            if (instagram) companyInfo.instagram = instagram;

            // Guardar los cambios en la base de datos
            const updatedCompany = await companyInfo.save();

            // Registrar la actividad de actualización con auditoría
            loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'update', 'Información de la empresa actualizada exitosamente.');

            // Responder con éxito
            res.status(200).json({ message: 'Información de la empresa actualizada exitosamente.', company: updatedCompany });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error al actualizar la información de la empresa.', error: error.message });
        }
    }
];

// Obtener la información de la empresa
exports.getCompanyInfo = async (req, res) => {
    try {
        // Buscar la información de la empresa donde esté activa, pero excluir el campo 'active' en la respuesta
        const companyInfo = await Company.findOne({ where: { active: true }, attributes: { exclude: ['active'] } });

        if (!companyInfo) {
            return res.status(404).json({ message: 'La información de la empresa no se encontró.' });
        }

        // Devolver la información de la empresa
        res.status(200).json({ company: companyInfo });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener la información de la empresa.', error: error.message });
    }
};

// Método para eliminar enlaces a las redes sociales de la empresa
exports.deleteSocialMediaLinks = [
    // Validar que se envíe al menos una red social a eliminar
    body('facebook').optional().isBoolean().withMessage('Debe ser un valor booleano.'),
    body('twitter').optional().isBoolean().withMessage('Debe ser un valor booleano.'),
    body('linkedin').optional().isBoolean().withMessage('Debe ser un valor booleano.'),
    body('instagram').optional().isBoolean().withMessage('Debe ser un valor booleano.'),

    async (req, res) => {
        // Verificar errores de validación
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { facebook, twitter, linkedin, instagram } = req.body;

        try {
            // Buscar la información de la empresa
            const companyInfo = await Company.findOne();

            if (!companyInfo) {
                return res.status(404).json({ message: 'La información de la empresa no se encontró.' });
            }

            // Eliminar las redes sociales especificadas en la solicitud
            if (facebook) companyInfo.facebook = null;
            if (twitter) companyInfo.twitter = null;
            if (linkedin) companyInfo.linkedin = null;
            if (instagram) companyInfo.instagram = null;

            // Guardar los cambios en la base de datos
            const updatedCompany = await companyInfo.save();

            // Registrar la actividad de eliminación
            loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'delete', 'Enlaces de redes sociales eliminados exitosamente.');

            // Responder con éxito
            res.status(200).json({ message: 'Enlaces de redes sociales eliminados exitosamente.', company: updatedCompany });
        } catch (error) {
            loggerUtils.logCriticalError(error);
            res.status(500).json({ message: 'Error al eliminar los enlaces de redes sociales.', error: error.message });
        }
    }
];

//Borrado lógico de la informacion de la empresa (marcarlo como inactivo)
exports.deleteCompany = async (req, res) => {
    try {
        // Buscar la empresa en la base de datos
        const company = await Company.findOne();

        if (!company) {
            return res.status(404).json({ message: 'La empresa no se encontró.' });
        }

        // Marcar como "inactivo" en lugar de eliminar
        company.active = false;

        await company.save();

        // Registrar la actividad del usuario
        loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'delete', 'Información de la empresa marcada como eliminada.');

        res.status(200).json({ message: 'La empresa ha sido eliminada lógicamente.' });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al eliminar la empresa.', error: error.message });
    }
};

//Deshacer el borrado de la informacion de la compañia (activarlo)
exports.restoreCompany = async (req, res) => {
    try {
        // Buscar la empresa que esté inactiva
        const company = await Company.findOne({ where: { active: false } });

        if (!company) {
            return res.status(404).json({ message: 'No se encontró una empresa inactiva para restaurar.' });
        }

        // Cambiar el estado de la empresa a "activa"
        company.active = true;
        await company.save();

        // Registrar la actividad de restauración en los logs
        loggerUtils.logUserActivity(req.user ? req.user._id : 'admin', 'restore', 'Información de la empresa restaurada.');

        res.status(200).json({ message: 'La empresa ha sido restaurada exitosamente.' });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al restaurar la empresa.', error: error.message });
    }
};