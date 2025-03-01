const express = require('express');
const router = express.Router();

//Importar controladores 
const collaboratorController = require('../controllers/collaboratorController');

//Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Rutas CRUD para Collaborators

//Crea un nuevo colaborador.
router.post('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), collaboratorController.createCollaborator);
// Obtiene todos los colaboradores.
router.get('/', authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']), collaboratorController.getAllCollaborators);
//Obtiene un colaborador por su ID.
router.get('/:id',authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']),  collaboratorController.getCollaboratorById);
//Actualiza un colaborador por ID.
router.put('/:id',authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']),  collaboratorController.updateCollaborator);
// Ruta para eliminar lógicamente colaboradores (solo administradores)
router.delete('/:id',authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,roleMiddleware(['administrador']),  collaboratorController.deleteCollaborator);

module.exports = router;
