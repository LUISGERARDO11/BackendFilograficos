/* The provided code snippet is a JavaScript module that includes functions related to authentication
and token management. Here is a breakdown of what the code does: */

const jwt = require('jsonwebtoken');
const { User, Session, Config } = require('../models/Associations');
const authService = require('../services/authService');

// Revocar tokens anteriores si se detecta actividad sospechosa o múltiples intentos fallidos
exports.revokeTokens = async (user_id) => {
    try {
        const updatedCount = await Session.update(
            { revoked: true },
            { where: { user_id, revoked: false } }
        );
        return updatedCount[0] > 0; // Retorna si se revocaron sesiones
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

        // Obtener configuración
        const config = await Config.findOne();
        const expirationThresholdSeconds = config?.expirationThreshold_lifetime ?? 900;
        const cookieLifetimeMilliseconds = config?.cookie_lifetime * 1000 ?? 3600000;

        // Renovar token si está cerca de expirar
        const timeToExpiration = decoded.exp - Date.now() / 1000;
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
        // Manejo específico de errores
        if (error instanceof jwt.JsonWebTokenError) {
            return res.status(401).json({ message: "Token inválido o expirado" });
        }
        if (error instanceof jwt.TokenExpiredError) {
            return res.status(401).json({ message: "Token expirado" });
        }
        
        // Error genérico
        console.error('Error en checkAuth:', error);
        return res.status(500).json({ message: "Error interno del servidor" });
    }
};