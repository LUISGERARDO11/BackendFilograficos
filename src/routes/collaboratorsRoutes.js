const express = require('express');
const router = express.Router();
const collaboratorController = require('../controllers/collaboratorController');
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { uploadLogo } = require('../config/multerConfig');

//Crea un nuevo colaborador.
router.post(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadLogo,
    collaboratorController.createCollaborator
);

// Obtiene todos los colaboradores.
router.get(
    '/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.getAllCollaborators
);

// Obtiene todos los colaboradores para publico HAILIE
router.get(
    '/public',
    collaboratorController.getAllCollaborators
);

router.get(
  '/auth',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  collaboratorController.getAllCollaborators
);

router.get(
  '/pag',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  collaboratorController.getCollaborators
);

//Obtiene un colaborador por su ID.
router.get(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.getCollaboratorById
);

//Actualiza un colaborador por ID.
router.put(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    uploadLogo,
    collaboratorController.updateCollaborator
);

// Ruta para eliminar lógicamente colaboradores (solo administradores)
router.delete(
    '/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.deleteCollaborator
);

module.exports = router;