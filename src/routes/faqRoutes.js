const express = require('express');
const router = express.Router();

// Importar controladores
const faqController = require('../controllers/faqController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');

// Crear una nueva pregunta frecuente (solo administradores)
router.post(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  faqController.createFaq
);

// Obtener todas las preguntas frecuentes activas - Ruta pública (sin autenticación)
router.get(
  '/public',
  (req, res) => faqController.getAllFaqs(req, res, false) // Pasamos isAdmin como false
);

// Obtener todas las preguntas frecuentes activas - Ruta para administradores (con autenticación)
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  (req, res) => faqController.getAllFaqs(req, res, true) // Pasamos isAdmin como true
);

// Obtener una pregunta frecuente por ID - Ruta pública (sin autenticación)
router.get(
  '/public/:id',
  (req, res) => faqController.getFaqById(req, res, false) // Pasamos isAdmin como false
);

// Obtener una pregunta frecuente por ID - Ruta para administradores (con autenticación)
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  (req, res) => faqController.getFaqById(req, res, true) // Pasamos isAdmin como true
);

// Actualizar una pregunta frecuente (solo administradores)
router.put(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  faqController.updateFaq
);

// Eliminar una pregunta frecuente - eliminación lógica (solo administradores)
router.delete(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  faqController.deleteFaq
);

module.exports = router;