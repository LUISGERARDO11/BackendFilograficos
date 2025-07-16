// authOptionalMiddleware.js
require("dotenv").config();
const authService = require("../services/authService");
const { RevokedToken } = require('../models/Associations');

// Middleware opcional para autenticación de token JWT
const authOptionalMiddleware = async (req, res, next) => {
  // Soporta tokens desde cookies (web) o header Authorization (Alexa)
  const token = req.headers.authorization?.split(' ')[1] || req.cookies["token"];

  // Si no hay token, continuar sin autenticación
  if (!token) {
    req.user = null;
    return next();
  }

  // Verificar si el token está revocado
  const isRevoked = await RevokedToken.findOne({ where: { token } });
  if (isRevoked) {
    req.user = null;
    return next();
  }

  try {
    // Verificar token y sesión
    const { success, data, session, message } = await authService.verifyJWT(token);
    if (!success) {
      req.user = null;
      return next();
    }

    // Validar scope para sesiones de Alexa
    if (session.browser === 'Alexa-Skill' && data.scope !== 'filograficos:admin') {
      req.user = null;
      return next();
    }

    // Extender sesión si está cerca de expirar
    const config = await authService.getConfig();
    const newToken = await authService.extendSession(session);

    if (newToken !== token) {
      console.log(`Token renovado: ${newToken}, expiration extendida`);
    } else {
      console.log(`Token sin cambios: ${token}`);
    }

    // Establecer la cookie solo para sesiones web
    if (req.cookies['token']) {
      res.cookie("token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax",
        maxAge: config.session_lifetime * 1000
      });
    }

    req.user = data;
    next();
  } catch (error) {
    console.error("Error en authOptionalMiddleware:", error);
    req.user = null;
    next();
  }
};

module.exports = authOptionalMiddleware;