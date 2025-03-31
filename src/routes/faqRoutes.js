/* This code snippet is setting up a router in a Node.js application using Express framework. Here's a
breakdown of what it does: */
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

// Obtener todas las preguntas frecuentes activas (público, con diferencias por rol)
router.get(
  '/',
  faqController.getAllFaqs
);

// Obtener una pregunta frecuente por ID (público, con diferencias por rol)
router.get(
  '/:id',
  faqController.getFaqById
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