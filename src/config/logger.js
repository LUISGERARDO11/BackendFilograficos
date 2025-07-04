/* This code snippet is setting up a logger using the Winston library in Node.js. Here's a breakdown of
what it does: */
const { createLogger, format, transports } = require('winston');
const moment = require('moment-timezone');
require('dotenv').config();

const logger = createLogger({
    level: 'info', // Captura información general y errores
    format: format.combine(
        format.timestamp({
            format: () => moment().tz('UTC').format('YYYY-MM-DD HH:mm:ssZ') // Timestamps en UTC
        }),
        format.errors({ stack: true }), // Captura errores con stack trace
        format.splat(),
        format.json()
    ),
    transports: [
        new transports.Console({
            format: format.combine(
                format.colorize(),
                format.printf(({ timestamp, level, message, stack }) => {
                    // Convertir timestamp a America/Mexico_City para la consola
                    const localTime = moment(timestamp).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss');
                    return stack ? `[${localTime}] ${level}: ${message}\n${stack}` : `[${localTime}] ${level}: ${message}`;
                })
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