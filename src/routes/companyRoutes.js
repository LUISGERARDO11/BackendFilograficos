/* This code snippet is setting up routes for a Node.js application using Express framework. It defines
various routes for handling different operations related to a company entity. Here's a breakdown of
what the code is doing: */
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/companyController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const { uploadLogo } = require('../config/multerConfig');

// Ruta para crear la información de la empresa (solo administradores)
router.post(
    '/create',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadLogo,
    companyController.createCompany
);

// Ruta para editar la información de la empresa (solo administradores)
router.put(
    '/update',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadLogo,
    companyController.updateCompanyInfo
);

// Ruta para agregar una red social (solo administradores)
router.post(
    '/social-media',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    companyController.addSocialMedia
);

// Ruta para actualizar una red social (solo administradores)
router.put(
    '/social-media',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    companyController.updateSocialMedia
);

// Ruta para eliminar una red social (solo administradores)
router.delete(
    '/social-media/:social_media_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    companyController.deleteSocialMedia
);

// Ruta para restaurar la información de la empresa (solo administradores)
router.put(
    '/restore',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    companyController.restoreCompany
);

// Ruta para eliminar lógicamente la información de la empresa (solo administradores)
router.delete(
    '/delete',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    companyController.deleteCompany
);

// Ruta para obtener la información de la empresa (público, sin seguridad)
router.get(
    '/',
    companyController.getCompanyInfo
);

module.exports = router;