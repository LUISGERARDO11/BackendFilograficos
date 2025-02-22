/* This code snippet is a middleware function in Node.js that is used to verify the authentication of a
JWT token stored in a cookie. Here's a breakdown of what the code does: */
const jwt = require("jsonwebtoken");
require("dotenv").config();

// Middleware para verificar la autenticación del token JWT desde cookies
const authMiddleware = (req, res, next) => {
  const token = req.cookies['token']; // Extraer el token de la cookie
  const secret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ message: "No autorizado. Por favor, inicia sesión." });
  }

  try {
    jwt.verify(token, secret, (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Token inválido o expirado. Por favor, inicia sesión nuevamente." });
      }

      req.user = decoded; // Guarda el usuario decodificado en el objeto de la solicitud
      console.log('Usuario decodificado:', req.user);
      req.token = token; // Pasa el token al siguiente middleware
      next(); // Continúa con el siguiente middleware
    });
  } catch (err) {
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};
module.exports = authMiddleware;