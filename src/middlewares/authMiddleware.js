require("dotenv").config();
const authService = require("../services/authService");

// Middleware para verificar la autenticación del token JWT desde cookies
const authMiddleware = async (req, res, next) => {
  const token = req.cookies["token"];
  
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

    if (newToken !== token) {
      console.log(`Token renovado: ${newToken}, expiration extendida`);
    } else {
      console.log(`Token sin cambios: ${token}`);
    }
    // Siempre establecer la cookie, incluso si el token no cambia, para asegurar sincronización
    res.cookie("token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // True en producción, false en desarrollo local
      sameSite: process.env.NODE_ENV === "production" ? "None" : "Lax", // Lax para desarrollo local
      maxAge: config.session_lifetime * 1000 // 15 min en milisegundos
    });

    req.user = data;
    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error);
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};

module.exports = authMiddleware;