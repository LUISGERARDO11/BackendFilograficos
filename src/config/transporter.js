const nodemailer = require('nodemailer');
require('dotenv').config(); // Asegúrate de que las variables de entorno estén cargadas

// Configuración del transporte SMTP usando ElasticEmail
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10), // Asegúrate de que el puerto sea numérico
  secure: process.env.SMTP_SECURE === 'true', // Usar SSL/TLS si la variable SMTP_SECURE es 'true'
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: process.env.SMTP_REJECT_UNAUTHORIZED === 'true', // Opción para entorno de producción seguro
  },
});

module.exports = transporter;