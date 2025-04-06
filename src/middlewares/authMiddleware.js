require("dotenv").config();
const authService = require("../services/authService");

// Middleware para verificar la autenticación del token JWT desde cookies
const authMiddleware = async (req, res, next) => {
  const token = req.cookies["token"]; // Extraer el token de la cookie
  
  if (!token) {
    return res.status(401).json({ message: "No autorizado. Por favor, inicia sesión." });
  }

  try {
    // Verificar token y sesión
    const { success, data, session, message } = await authService.verifyJWT(token);
    if (!success) {
      return res.status(401).json({ message });
    }

    // Extender sesión si está cerca de expirar
    const config = await authService.getConfig();
    const newToken = await authService.extendSession(session);

    // Actualizar cookie si se generó un nuevo token
    if (newToken !== token) {
      res.cookie("token", newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "None",
        maxAge: config.session_lifetime * 1000 // 15 min en milisegundos
      });
    }

    // Pasar datos del usuario al siguiente middleware
    req.user = data; // { user_id, user_type }
    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error);
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};

module.exports = authMiddleware;