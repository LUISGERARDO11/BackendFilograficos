/* This code snippet is setting up a router in a Node.js application using Express framework. Here's a
breakdown of what each part of the code is doing: */
const express = require('express');
const router = express.Router();

//Importar controladores 
const emailTemplateController = require('../controllers/emailTemplateController');

//Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Crear plantilla
router.post('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTemplateController.createEmailTemplate);

// Obtener todas las plantillas activas
router.get('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), emailTemplateController.getAllEmailTemplates);

// Obtener todas las plantillas activas con paginacion
router.get('/pag', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), emailTemplateController.getEmailTemplates);

// Obtener plantilla por ID
router.get('/:templateId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), emailTemplateController.getEmailTemplateById);

// Actualizar plantilla
router.put('/:templateId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTemplateController.updateEmailTemplate);

// Eliminar plantilla (lógica)
router.delete('/:templateId', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTemplateController.deleteEmailTemplate);

module.exports = router;
