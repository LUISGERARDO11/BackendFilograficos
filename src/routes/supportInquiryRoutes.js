const express = require('express');
const router = express.Router();

// Importar controladores
const supportInquiryController = require('../controllers/supportInquiryController');

// Importar middlewares
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const tokenExpirationMiddleware = require('../middlewares/verifyTokenExpiration');
const validateSupportInquiry = require('../middlewares/validateSupportInquiry'); // Importar validaciones

// ** CONSULTAS DE SOPORTE **

// Crear una nueva consulta de soporte
router.post('/', validateSupportInquiry.validateConsultation, supportInquiryController.createConsultation);

// Obtener todas las consultas de soporte (requiere autenticación y rol de administrador)
router.get(
  '/',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  supportInquiryController.getAllConsultations
);

// Obtener el número total de consultas por cada estado (requiere autenticación y rol de administrador)
router.get(
  '/counts-by-status',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  supportInquiryController.getConsultationCountsByStatus
);

// Obtener consultas en base a filtros que se le pasan
router.get(
  '/filtered',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  supportInquiryController.getFilteredConsultations
);

// Obtener una consulta específica por ID (requiere autenticación)
router.get(
  '/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateSupportInquiry.validateIdParam,
  supportInquiryController.getConsultationById
);

// Actualizar el estado de una consulta por ID (requiere autenticación y rol de administrador)
router.put(
  '/update-status/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateSupportInquiry.validateStatusUpdate,
  supportInquiryController.updateConsultationStatus
);

// Actualizar el canal de contacto de una consulta por ID (requiere autenticación y rol de administrador)
router.put(
  '/update-contact-channel/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateSupportInquiry.validateContactChannelUpdate,
  supportInquiryController.updateConsultationContactChannel
);

// Actualizar el canal de respuesta de una consulta por ID (requiere autenticación y rol de administrador)
router.put(
  '/update-response-channel/:id',
  authMiddleware,
  tokenExpirationMiddleware.verifyTokenExpiration,
  roleMiddleware(['administrador']),
  validateSupportInquiry.validateResponseChannelUpdate,
  supportInquiryController.updateConsultationResponseChannel
);

module.exports = router;