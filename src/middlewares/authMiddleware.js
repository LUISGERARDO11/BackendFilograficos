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

    // Detectar si el origen es localhost para desarrollo
    const isLocalhost = req.headers.origin && req.headers.origin.includes("localhost");
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production" && !isLocalhost, // False si es localhost
      sameSite: process.env.NODE_ENV === "production" && !isLocalhost ? "None" : "Lax", // Lax para localhost
      maxAge: config.session_lifetime * 1000
    };

    if (newToken !== token) {
      console.log(`Token renovado: ${newToken}, expiration extendida`);
    } else {
      console.log(`Token sin cambios: ${token}`);
    }

    res.cookie("token", newToken, cookieOptions);
    req.user = data;
    next();
  } catch (error) {
    console.error("Error en authMiddleware:", error);
    return res.status(500).json({ message: "Error al procesar el token." });
  }
};

module.exports = authMiddleware;