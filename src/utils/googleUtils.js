const axios = require('axios');
require('dotenv').config();

/**
 * Verifica el token de reCAPTCHA con la API de Google.
 * @param {string} recaptchaToken - El token de reCAPTCHA enviado por el cliente.
 * @param {object} res - El objeto de respuesta de Express para enviar errores.
 * @returns {boolean} - Verdadero si la verificación es exitosa, falso si falla.
 */
const verifyRecaptcha = async (recaptchaToken, res) => {
  const recaptchaSecretKey = process.env.RECAPTCHA_SECRET_KEY;
  try {
    const recaptchaResponse = await axios.post(
      `https://www.google.com/recaptcha/api/siteverify`,
      null,
      { params: { secret: recaptchaSecretKey, response: recaptchaToken } }
    );
    const { success, score } = recaptchaResponse.data;
    if (!success || score < 0.5) {
      res.status(400).json({ message: 'Fallo en la verificación de reCAPTCHA' });
      return false;
    }
    return true;
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar reCAPTCHA', error: error.message });
    return false;
  }
};

module.exports = verifyRecaptcha;