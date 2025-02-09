/* This code snippet is setting up CSRF (Cross-Site Request Forgery) protection for a Node.js
application using the `csrf-csrf` library. Here's a breakdown of what the code is doing: */
const { doubleCsrf } = require('csrf-csrf');
require('dotenv').config();

const doubleCsrfOptions = {
    getSecret: () => process.env.CSRF_SECRET_KEY || 'yourSecretKey', // Clave secreta para token CSRF
    cookieName: 'x-csrf-token', // Nombre de la cookie que almacena el token
    cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // Solo usa secure en producción
        sameSite: process.env.NODE_ENV === 'production' ? 'None' : 'Strict',
    },
    size: 64, // Tamaño del token
    ignoredMethods: ['GET', 'HEAD', 'OPTIONS'], // Métodos sin protección CSRF
    getTokenFromRequest: (req) => req.headers['x-csrf-token'], // Extrae el token del encabezado
};

const {
    invalidCsrfTokenError, // Error si el token es inválido
    generateToken, // Genera el token CSRF
    doubleCsrfProtection, // Middleware de protección CSRF
} = doubleCsrf(doubleCsrfOptions);

module.exports = {
    invalidCsrfTokenError,
    generateToken,
    doubleCsrfProtection,
};
