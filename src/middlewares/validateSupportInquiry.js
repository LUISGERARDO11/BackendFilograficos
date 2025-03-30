const { body, param } = require('express-validator');

module.exports = {
  validateConsultation: [
    body('user_name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
    body('user_email').isEmail().withMessage('Debe ser un correo válido').normalizeEmail(),
    body('subject').trim().notEmpty().withMessage('El asunto es obligatorio').escape(),
    body('message').trim().notEmpty().withMessage('El mensaje es obligatorio').escape(),
    body('recaptchaToken').not().isEmpty().withMessage('Se requiere el token de reCAPTCHA'),
  ],

  validateIdParam: [
    param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
  ],

  validateStatusUpdate: [
    param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
    body('status').trim().notEmpty().withMessage('El estado es obligatorio').escape(),
  ],

  validateContactChannelUpdate: [
    param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
    body('contact_channel').trim().notEmpty().withMessage('El canal de contacto es obligatorio').escape(),
  ],

  validateResponseChannelUpdate: [
    param('id').isInt().withMessage('El ID debe ser un número entero').toInt(),
    body('response_channel').trim().notEmpty().withMessage('El canal de respuesta es obligatorio').escape(),
  ],
};