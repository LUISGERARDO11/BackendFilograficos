const logger = require('../config/logger');
require('dotenv').config();
/**
 * The errorHandler function in JavaScript handles various types of errors and returns appropriate
 * responses with detailed messages for each case.
 * @param err - The `err` parameter in the `errorHandler` function represents the error object that is
 * passed to the middleware function. This object contains information about the error that occurred
 * during the execution of the request handler. The error object typically includes properties like
 * `name`, `message`, `stack`, and additional properties
 * @param req - The `req` parameter in the `errorHandler` function stands for the request object. It
 * contains information about the HTTP request made to the server, including headers, parameters, body,
 * URL, etc. This object is typically used to access data sent from the client to the server.
 * @param res - The `res` parameter in the `errorHandler` function refers to the response object in
 * Express.js. It is used to send a response back to the client making the request. In the context of
 * error handling, `res` is used to send an appropriate HTTP response with relevant error information
 * based on
 * @param next - The `next` parameter in the `errorHandler` function is a reference to the next
 * middleware function in the application's request-response cycle. It is a callback function that is
 * used to pass control to the next middleware function. If an error occurs and you want to skip the
 * current middleware and pass the
 * @returns The `errorHandler` function is returning different JSON responses based on the type of
 * error encountered:
 */
const errorHandler = (err, req, res, next) => {
  console.error(err); // Imprime el error en la consola para depuración
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  // Manejo de errores de validación de Mongoose
  if (err.name === "ValidationError") {
    return res.status(400).json({
      message: "Error de validación",
      errors: Object.values(err.errors).map((e) => ({
        field: e.path,
        message: e.message,
      })),
    });
  }

  // Manejo de error de duplicado en MongoDB (clave única duplicada)
  if (err.code === 11000) {
    return res.status(409).json({
      message: "El recurso ya existe",
      error: err.keyValue, // Información sobre el campo duplicado (por ejemplo, email o username)
    });
  }

  // Manejo de error de autorización (token inválido o no enviado)
  if (err.name === "UnauthorizedError") {
    return res.status(401).json({ message: "No autorizado" });
  }

  // Manejo de error de acceso prohibido (falta de permisos)
  if (err.name === "ForbiddenError") {
    return res.status(403).json({ message: "Acceso prohibido" });
  }

  // Manejo de error de recurso no encontrado
  if (err.name === "NotFoundError") {
    return res.status(404).json({ message: "Recurso no encontrado" });
  }

  // Error por defecto (500 Internal Server Error)
  res.status(500).json({
    message: "Error interno del servidor",
    ...(process.env.NODE_ENV === "development" && { error: err.message }), // Muestra detalles en modo desarrollo
  });
};

module.exports = errorHandler;