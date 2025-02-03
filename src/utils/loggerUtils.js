const logger = require('../config/logger');

// Función para registrar actividad del usuario
exports.logUserActivity = (userId, action, message) => {
    logger.info({
        userId,
        action, // Ejemplo: login, failed login, password change
        message,
        timestamp: new Date().toISOString()
    });
};

// Función para registrar eventos de seguridad (ejemplo: acceso a recursos sensibles)
exports.logSecurityEvent = (userId, resource, action, message) => {
    logger.info({
        userId,
        resource, // Ejemplo: ruta del recurso al que se accede
        action, // Ejemplo: acceso autorizado/no autorizado
        message,
        timestamp: new Date().toISOString()
    });
};

// Función para registrar errores críticos
exports.logCriticalError = (error) => {
    logger.error({
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
    });
};
