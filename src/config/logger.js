const { createLogger, format, transports } = require('winston');
require('dotenv').config();

const logger = createLogger({
    level: 'info', // Captura información general y errores
    format: format.combine(
        format.timestamp({
            format: 'YYYY-MM-DD HH:mm:ss',
        }),
        format.errors({ stack: true }), // Captura errores con stack trace
        format.splat(),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(), // Colores para la consola
                format.simple()    // Simple en consola
            )
        })
    ],
});

// Solo escribir en archivos si no estamos en producción
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.File({ filename: 'logs/error.log', level: 'error' })); // Solo errores
    logger.add(new transports.File({ filename: 'logs/combined.log' })); // Todos los logs
}

module.exports = logger;
