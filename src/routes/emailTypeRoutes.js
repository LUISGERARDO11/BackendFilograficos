/* This code snippet is setting up routes for handling different HTTP requests related to email types
in a Node.js application using Express framework. Here's a breakdown of what each part of the code
is doing: */
const express = require('express');
const router = express.Router();

//Importar controladores 
const emailTypeController = require('../controllers/emailTypeController');

//Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

//Crear tipo de email 
router.post('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), emailTypeController.createEmailType);

// Obtener tipo por ID
router.get('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTypeController.getEmailTypeById);

// Obtener todos los tipos activos
router.get('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTypeController.getAllEmailTypes);

// Obtener todos los tipos activos con paginacion
router.get('/pag', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration, roleMiddleware(['administrador']), emailTypeController.getEmailTypes);

// Actualizar tipo de email
router.put('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,  roleMiddleware(['administrador']), emailTypeController.updateEmailType);

//Eliminación lógica
router.delete('/:id', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,  roleMiddleware(['administrador']), emailTypeController.deleteEmailType);

module.exports = router; 
