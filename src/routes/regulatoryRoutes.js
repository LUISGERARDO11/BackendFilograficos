/* This JavaScript code is setting up a router using Express.js, a popular Node.js web application
framework. The router defines various routes for handling different HTTP requests related to
regulatory documents. Here's a breakdown of what the code is doing: */
const express = require('express');
const router = express.Router();
const regulatoryController = require('../controllers/regulatoryController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const validateRegulatoryDocument = require('../middlewares/validateRegulatory');
const { uploadRegulatory } = require('../config/multerConfig');

// ** CREACIÓN Y ACTUALIZACIÓN **
// Ruta para crear un nuevo documento regulatorio
router.post(
    '/create',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadRegulatory,
    validateRegulatoryDocument,
    regulatoryController.createRegulatoryDocument
);

// Ruta para actualizar un documento regulatorio (nueva versión)
router.put(
    '/update/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadRegulatory,
    regulatoryController.updateRegulatoryDocument
);

// ** ELIMINACIÓN (LÓGICA) **
// Ruta para eliminar lógicamente un documento regulatorio
router.delete(
    '/delete-document/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.deleteRegulatoryDocument
);

// Ruta para eliminar lógicamente una versión específica de un documento regulatorio
router.delete(
    '/delete/:document_id/:version_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.deleteRegulatoryDocumentVersion
);

// ** RESTAURACIÓN **
// Ruta para restaurar un documento regulatorio eliminado
router.put(
    '/restore-document/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.restoreRegulatoryDocument
);

// Ruta para restaurar una versión específica de un documento regulatorio
router.put(
    '/restore-version/:document_id/:version_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.restoreRegulatoryDocumentVersion
);

// ** CONSULTAS **
// Ruta para obtener el historial de versiones de un documento
router.get(
    '/version-history/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.getVersionHistory
);

// Ruta para obtener la version actual de un documento regulatorio
router.get(
    '/current-version/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.getCurrentVersionById
);

// Ruta para obtener un documento regulatorio por su ID
router.get(
    '/document/:document_id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    regulatoryController.getDocumentById
);

// ** CONSULTAS PÚBLICAS **
// Ruta para obtener la versión vigente de un documento regulatorio (público)
router.get('/:title', regulatoryController.getCurrentVersion);

// Ruta para obtener todos los documentos regulatorios vigentes (público)
router.get('/', regulatoryController.getAllCurrentVersions);

module.exports = router;
