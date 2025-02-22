/* This code snippet is setting up a validation middleware function using the `express-validator`
library in a Node.js application. Let me break it down for you: */
const { body, validationResult } = require('express-validator');

const validateRegulatory = [
  // Validar el título
  body('title')
    .isString().withMessage('El título debe ser un texto válido.')
    .trim()
    .notEmpty().withMessage('El título es obligatorio.')
    .isIn(['Política de privacidad', 'Términos y condiciones', 'Deslinde legal'])
    .withMessage('El título debe ser válido (Política de privacidad, Términos y condiciones, Deslinde legal).'),
  
  // Validar la fecha de vigencia
  body('effective_date')
    .optional()
    .isISO8601().withMessage('La fecha de vigencia debe ser una fecha válida (ISO 8601).'),

  // Validar la versión del documento (opcional)
  body('version')
    .optional()
    .matches(/^\d+(\.\d+)?$/).withMessage('La versión debe estar en el formato correcto, por ejemplo, 1.0, 2.0.'),

  // Manejar los errores de validación
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

module.exports = validateRegulatory;
