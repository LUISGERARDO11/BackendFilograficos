/* This JavaScript code defines a module that exports three functions for logging different types of
activities using a logger object. Here's a breakdown of what each function does: */
const logger = require('../config/logger');
const moment = require('moment-timezone');

// Función para registrar actividad del usuario
exports.logUserActivity = (userId, action, message) => {
    logger.info({
        userId,
        action,
        message,
        timestamp: moment().tz('UTC').toISOString() // Almacenar en UTC
    });
};

// Función para registrar eventos de seguridad
exports.logSecurityEvent = (userId, resource, action, message) => {
    logger.info({
        userId,
        resource,
        action,
        message,
        timestamp: moment().tz('UTC').toISOString() // Almacenar en UTC
    });
};

// Función para registrar errores críticos
exports.logCriticalError = (error) => {
    logger.error({
        message: error.message,
        stack: error.stack,
        timestamp: moment().tz('UTC').toISOString() // Almacenar en UTC
    });
};