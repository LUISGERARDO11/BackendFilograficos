const express = require('express');
const router = express.Router();
const multer = require('multer');

//Importar controladores 
const collaboratorController = require('../controllers/collaboratorController');

//Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Rutas CRUD para Collaborators
// Configuración de multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });


//Crea un nuevo colaborador.
router.post('/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    upload.single('logo'),
    collaboratorController.createCollaborator
);
// Obtiene todos los colaboradores.
router.get('/',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.getAllCollaborators
);
// Obtiene todos los colaboradores para publico HAILIE
router.get('/public',
    collaboratorController.getAllCollaborators
);
router.get('/auth',
    authMiddleware, tokenExpirationMiddleware.verifyTokenExpiration,
    collaboratorController.getAllCollaborators
);
// Obtiene todos los colaboradores con paginacion.
router.get('/pag',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.getCollaborators
);
//Obtiene un colaborador por su ID.
router.get('/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.getCollaboratorById
);
//Actualiza un colaborador por ID.
router.put('/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    upload.single('logo'), // ¡Añadido aquí!
    collaboratorController.updateCollaborator
);
// Ruta para eliminar lógicamente colaboradores (solo administradores)
router.delete('/:id',
    authMiddleware,
    tokenExpirationMiddleware.verifyTokenExpiration,
    roleMiddleware(['administrador']),
    collaboratorController.deleteCollaborator
);
module.exports = router;
