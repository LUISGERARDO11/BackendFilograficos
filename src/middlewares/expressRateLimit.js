/* This code snippet is setting up rate limiting middleware using the `express-rate-limit` package in a
Node.js application. */
const rateLimit = require("express-rate-limit");

// Middleware para limitar solicitudes (100 solicitudes por minuto)
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100, // Límite de 100 solicitudes por IP por minuto
  message:
    "Has excedido el límite de solicitudes permitidas. Intenta nuevamente más tarde.",
  headers: true, // Incluir los encabezados de límite en la respuesta
  standardHeaders: true, // Enviar los encabezados RateLimit-* estándar
  legacyHeaders: false, // Desactivar los encabezados X-RateLimit-*
});

// Middleware para limitar solicitudes en rutas críticas (como login) (5 solicitudes por minuto)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // Límite de 5 solicitudes por IP en rutas críticas
  message: "Demasiados intentos en poco tiempo. Intenta nuevamente más tarde.",
  headers: true,
});

// Exportar los limitadores para que puedan ser utilizados en otras partes de la app
module.exports = {
  generalLimiter,
  authLimiter,
};
