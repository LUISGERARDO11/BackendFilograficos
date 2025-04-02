const jwt = require("jsonwebtoken");
require("dotenv").config();
const { Session, SystemConfig } = require("../models/Associations");
const authService = require("../services/authService");

// Middleware para verificar la autenticación del token JWT desde cookies
const authMiddleware = async (req, res, next) => {
  const token = req.cookies["token"]; // Extraer el token de la cookie
  const secret = process.env.JWT_SECRET;

  if (!token) {
    return res.status(401).json({ message: "No autorizado. Por favor, inicia sesión." });
  }

  try {
    // Verificar y decodificar el JWT directamente
    jwt.verify(token, secret, async (err, decoded) => {
      if (err) {
        return res.status(401).json({ message: "Token inválido o expirado. Por favor, inicia sesión nuevamente." });
      }

      req.user = decoded; // Guardar el usuario decodificado en la solicitud

      // Buscar la sesión asociada al token
      const session = await Session.findOne({ where: { token, revoked: false } });
      if (!session) {
        return res.status(401).json({ message: "Sesión no encontrada o ya revocada." });
      }

      // Obtener configuración del sistema
      const config = await SystemConfig.findOne({ where: { config_id: 1 } });
      const maxInactivityTime = config.max_inactivity_time * 1000; // 5 minutos en ms
      const sessionExtensionThreshold = config.session_extension_threshold * 1000; // 5 minutos en ms
      const sessionLifetime = config.session_lifetime * 1000; // 15 minutos en ms
      const jwtLifetimeMs = config.jwt_lifetime * 1000; // 15 minutos en ms

      const now = Date.now();

      // Verificar inactividad
      const inactivityTime = now - new Date(session.last_activity).getTime();
      if (inactivityTime > maxInactivityTime) {
        await session.update({ revoked: true });
        return res.status(401).json({ message: "Sesión expirada por inactividad. Por favor, inicia sesión nuevamente." });
      }

      // Verificar si la sesión necesita extensión
      const timeToExpiration = new Date(session.expiration).getTime() - now;
      if (timeToExpiration < sessionExtensionThreshold) {
        const newExpiration = new Date(now + sessionLifetime);
        await session.update({ expiration: newExpiration });
      }

      // Actualizar last_activity
      await session.update({ last_activity: new Date(now) });

      // Verificar si el JWT necesita rotación
      const tokenExp = decoded.exp * 1000; // exp está en segundos, convertir a ms
      const timeToTokenExpiration = tokenExp - now;
      if (timeToTokenExpiration < sessionExtensionThreshold) {
        // Generar un nuevo JWT
        const newToken = await authService.generateJWT({
          user_id: decoded.user_id,
          user_type: decoded.user_type,
        });

        // Actualizar la sesión con el nuevo token
        await session.update({ token: newToken });

        // Actualizar la cookie con el nuevo token
        res.cookie("token", newToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "None",
          maxAge: jwtLifetimeMs,
        });

        req.token = newToken; // Pasar el nuevo token al siguiente middleware
      } else {
        req.token = token; // Mantener el token original
      }

      next(); // Continuar con el siguiente middleware
    });
  } catch (err) {
    console.error("Error en authMiddleware:", err);
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};

module.exports = authMiddleware;