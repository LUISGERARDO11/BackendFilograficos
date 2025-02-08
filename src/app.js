const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

// Importar configuraciones
const logger = require('./config/logger');
const corsConfig = require('./config/corsConfig');
const { generateToken, doubleCsrfProtection } = require('./config/csrfConfig');

// Importar middlewares
const errorHandler = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/expressRateLimit');

// Importar utilidades
const authUtils = require('./utils/authUtils');

// Importar las rutas disponibles
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const emailTemplateRoutes = require('./routes/emailTemplateRoutes');
const emailTypeRoutes = require('./routes/emailTypeRoutes');
const passwordRoutes = require('./routes/passwordRoutes');
const regulatoryRoutes = require('./routes/regulatoryRoutes');
const securityRoutes = require('./routes/securityRoutes');
const sessionRoutes = require('./routes/sessionRoutes');
const userRoutes = require('./routes/userRoutes');

const app = express();

app.set('trust proxy', 1);

// Middleware para el manejo de JSON
app.use(express.json());

// Aplicar la configuración de CORS
app.use(corsConfig);

// Aplicar el limitador general a todas las rutas
app.use(generalLimiter);

// Configurar cookie-parser
app.use(cookieParser());

// Ruta para obtener un token CSRF
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ csrfToken });
});

app.use(doubleCsrfProtection);

// Integrar Morgan con Winston para registrar solicitudes HTTP
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()) // Enviar logs a Winston
  }
}));

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Hola Mundo!');
});

// Cargar la lista de contraseñas filtradas al iniciar la aplicación
authUtils.loadPasswordList();

// Rutas de la aplicación
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/email-templates', emailTemplateRoutes);
app.use('/api/email-types', emailTypeRoutes);
app.use('/api/password', passwordRoutes);
app.use('/api/regulatory', regulatoryRoutes);
app.use('/api/security', securityRoutes);
app.use('/api/session', sessionRoutes);
app.use('/api/users', userRoutes);

// Middleware para manejar errores
app.use(errorHandler);

module.exports = app;
