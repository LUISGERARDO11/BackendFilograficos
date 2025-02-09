/* The provided code snippet is a JavaScript module that includes functions related to authentication
and token management. Here is a breakdown of what the code does: */

const jwt = require('jsonwebtoken');
const { User, Session, Config } = require('../models/Associations');
const authService = require('../services/authService'); // Importa el servicio de autenticación

// Revocar tokens anteriores si se detecta actividad sospechosa o múltiples intentos fallidos
exports.revokeTokens = async (user_id) => {
    try {
        await Session.update(
            { revoked: true },
            { where: { user_id, revoked: false } }
        );
    } catch (error) {
        console.error('Error revocando sesiones anteriores:', error);
    }
};

exports.checkAuth = async (req, res, next) => {
    const token = req.cookies.token; // Extraer el token de la cookie

    if (!token) {
        return res.status(401).json({ message: "No autenticado" });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET); // Verificación del token JWT
    } catch (err) {
        return res.status(401).json({ message: "Token inválido o expirado" });
    }

    const userId = decoded.user_id;

    // Búsqueda del usuario
    const user = await User.findByPk(userId);
    if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
    }

    // Verificación de la cuenta del usuario
    if (user.estado !== "activo") {
        return res.status(403).json({ message: "Usuario no autorizado o inactivo." });
    }

    // Obtener la configuración de la aplicación
    const config = await Config.findOne();
    const expirationThresholdSeconds = config ? config.expirationThreshold_lifetime : 900; // En segundos
    const cookieLifetimeMilliseconds = config ? config.cookie_lifetime * 1000 : 3600000; // En milisegundos

    // Renovar el token si está cerca de expirar
    if (decoded.exp - Date.now() / 1000 < expirationThresholdSeconds) {
        const newToken = authService.generateJWT(user); // Generar un nuevo token

        // Establecer la nueva cookie con el token renovado
        res.cookie("token", newToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: 'None',
            maxAge: cookieLifetimeMilliseconds, // Tiempo de vida de la cookie en milisegundos
        });
    }

    // Envío de la información del usuario
    res.json({
        userId: user.user_id,
        email: user.email,
        tipo: user.tipo_usuario,
        nombre: user.nombre,
    });
};