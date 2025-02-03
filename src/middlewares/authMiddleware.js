/* This code snippet is a middleware function in Node.js that is used to verify the authentication of a
JWT token stored in a cookie. Here's a breakdown of what the code does: */
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Middleware para verificar la autenticación del token JWT desde cookies
const authMiddleware = (req, res, next) => {
  const token = req.cookies['token']; // Extraer el token de la cookie
  const secret = process.env.JWT_SECRET;

  console.log('Token:', token); // Log del token
  console.log('Todas las cookies:', req.cookies);
  console.log('JWT_SECRET:', secret); // Log del secreto

  // URLs base para redirección
  const baseUrls = {
    development: [
      'http://localhost:3000',
      'http://localhost:4200',
      'http://127.0.0.1:4200',
      'http://127.0.0.1:3000',
    ],
    production: ['https://web-filograficos.vercel.app'],
  };

  const currentEnv = baseUrls[process.env.NODE_ENV]
    ? process.env.NODE_ENV
    : 'development';
  const loginUrl = `${baseUrls[currentEnv][0]}/login`;

  // Si no hay token, redirige al usuario a la página de inicio de sesión
  if (!token) {
    console.warn("Token no proporcionado. Redirigiendo a la página de inicio de sesión...");
    return res.redirect(loginUrl);
  }

  try {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        console.error('Error de verificación del token:', err);

        // Redirigir a la página de inicio de sesión directamente
        return res.redirect(loginUrl);
      }

      req.user = decoded; // Guarda el usuario decodificado en el objeto de la solicitud
      console.log('Usuario decodificado:', req.user);
      next(); // Continúa con el siguiente middleware
    });
  } catch (err) {
    console.error("Error al procesar el token:", err);
    return res.redirect(loginUrl); // En caso de un error inesperado, redirige al login
  }
};

module.exports = authMiddleware;