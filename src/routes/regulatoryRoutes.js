const express = require('express');
const router = express.Router();

// Importar controladores
const regulatoryController = require('../controllers/regulatoryController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const validateRegulatoryDocument = require('../middlewares/validateRegulatory');

// ** CREACIÓN Y ACTUALIZACIÓN **
// Ruta para crear un nuevo documento regulatorio
router.post('/create', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), validateRegulatoryDocument, regulatoryController.createRegulatoryDocument);

// Ruta para actualizar un documento regulatorio (nueva versión)
router.put('/update/:documentId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.updateRegulatoryDocument);

// ** ELIMINACIÓN (LÓGICA) **
// Ruta para eliminar lógicamente un documento regulatorio
router.delete('/delete-document/:documentId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.deleteRegulatoryDocument);

// Ruta para eliminar lógicamente una versión específica de un documento regulatorio
router.delete('/delete/:documentId/:versionToDelete', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.deleteRegulatoryDocumentVersion);

// ** RESTAURACIÓN **
// Ruta para restaurar un documento regulatorio eliminado
router.put('/restore-document/:documentId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.restoreRegulatoryDocument);

// Ruta para restaurar una versión específica de un documento regulatorio
router.put('/restore-version/:documentId/:versionId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.restoreRegulatoryDocumentVersion);

// ** CONSULTAS **
// Ruta para obtener el historial de versiones de un documento
router.get('/version-history/:titulo', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.getVersionHistory);

// Ruta para obtener un documento regulatorio por su ID
router.get('/document/:documentId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), regulatoryController.getDocumentById);

// ** CONSULTAS PÚBLICAS **
// Ruta para obtener la versión vigente de un documento regulatorio (público)
router.get('/:titulo', regulatoryController.getCurrentVersion);

// Ruta para obtener todos los documentos regulatorios vigentes (público)
router.get('/', regulatoryController.getAllCurrentVersions);

module.exports = router;
