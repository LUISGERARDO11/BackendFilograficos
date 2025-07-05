require("dotenv").config();
const authService = require("../services/authService");
const { RevokedToken } = require('../models/Associations');

// Middleware para verificar la autenticación del token JWT
const authMiddleware = async (req, res, next) => {
  // Soporta tokens desde cookies (web) o header Authorization (Alexa)
  const token = req.headers.authorization?.split(' ')[1] || req.cookies["token"];
  
  if (!token) {
    return res.status(401).json({ message: "No autorizado. Por favor, inicia sesión." });
  }

  // Verificar si el token está revocado
  const isRevoked = await RevokedToken.findOne({ where: { token } });
  if (isRevoked) {
    return res.status(401).json({ message: "Token revocado." });
  }

  try {
    // Verificar token y sesión
    const { success, data, session, message } = await authService.verifyJWT(token);
    if (!success) {
      return res.status(401).json({ message });
    }

    // Validar scope para sesiones de Alexa
    if (session.browser === 'Alexa-Skill' && data.scope !== 'filograficos:admin') {
      return res.status(401).json({ message: "Scope inválido para la skill de Alexa." });
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
    console.error("Error en authMiddleware:", error);
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};

module.exports = authMiddleware;