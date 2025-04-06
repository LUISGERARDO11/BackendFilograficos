/* The provided code snippet is a JavaScript module that includes functions related to authentication
and token management. Here is a breakdown of what the code does: */

const jwt = require('jsonwebtoken');
const { User, Session, Config } = require('../models/Associations');
const authService = require('../services/authService');

// Constantes para valores por defecto
const DEFAULT_EXPIRATION_THRESHOLD = 900; // 15 minutos en segundos
const DEFAULT_COOKIE_LIFETIME = 3600; // 1 hora en segundos

// Revocar tokens anteriores
exports.revokeTokens = async (user_id) => {
    if (!user_id) {
        throw new Error('ID de usuario requerido');
    }

    try {
        const [updatedCount] = await Session.update(
            { revoked: true },
            { where: { user_id, revoked: false } }
        );
        return updatedCount > 0;
    } catch (error) {
        throw new Error(`Error revocando sesiones anteriores: ${error.message}`);
    }
};

// Middleware para verificar autenticación
exports.checkAuth = async (req, res, next) => {
    try {
        const token = req.cookies.token;
        if (!token) {
            return res.status(401).json({ message: "No autenticado" });
        }

        // Verificar token JWT
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.user_id;

        // Buscar usuario
        const user = await User.findByPk(userId);
        if (!user) {
            return res.status(404).json({ message: "Usuario no encontrado" });
        }

        // Verificar estado del usuario
        if (user.estado !== "activo") {
            return res.status(403).json({ message: "Usuario no autorizado o inactivo" });
        }

        // Obtener configuración con valores por defecto
        const config = await Config.findOne() || {};
        const expirationThresholdSeconds = config.expiration_threshold_lifetime || DEFAULT_EXPIRATION_THRESHOLD;
        const cookieLifetimeSeconds = config.cookie_lifetime || DEFAULT_COOKIE_LIFETIME;
        const cookieLifetimeMilliseconds = cookieLifetimeSeconds * 1000;

        // Renovar token si está cerca de expirar
        const timeToExpiration = decoded.exp - Math.floor(Date.now() / 1000);
        if (timeToExpiration < expirationThresholdSeconds) {
            const newToken = authService.generateJWT(user);
            res.cookie("token", newToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: 'None',
                maxAge: cookieLifetimeMilliseconds,
            });
        }

        // Respuesta exitosa
        return res.json({
            userId: user.user_id,
            email: user.email,
            tipo: user.tipo_usuario,
            nombre: user.nombre,
        });

    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: "Token inválido" });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: "Token expirado" });
        }

        console.error('Error en checkAuth:', {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};