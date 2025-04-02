/* This code snippet is setting up a Node.js Express application. Here's a breakdown of what it does: */
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

// Importar rutas disponibles
const routes = [
  { path: '/api/auth', router: require('./routes/authRoutes') },
  { path: '/api/company', router: require('./routes/companyRoutes') },
  { path: '/api/email-templates', router: require('./routes/emailTemplateRoutes') },
  { path: '/api/email-types', router: require('./routes/emailTypeRoutes') },
  { path: '/api/password', router: require('./routes/passwordRoutes') },
  { path: '/api/regulatory', router: require('./routes/regulatoryRoutes') },
  { path: '/api/security', router: require('./routes/securityRoutes') },
  { path: '/api/session', router: require('./routes/sessionRoutes') },
  { path: '/api/users', router: require('./routes/userRoutes') },
  { path: '/api/faq-categories', router: require('./routes/faqCategoriesRoutes') },
  { path: '/api/faq', router: require('./routes/faqRoutes') },
  { path: '/api/support-inquiry', router: require('./routes/supportInquiryRoutes') },
  { path: '/api/product-attributes', router: require('./routes/productAttributeRoutes') },
  { path: '/api/products', router: require('./routes/productRoutes') },
  { path: '/api/notifications', router: require('./routes/notificationRoutes') },
  { path: '/api/communication', router: require('./routes/communicationRoutes') },
  { path: '/api/promotions', router: require('./routes/promotionRoutes') },
  { path: '/api/banners', router: require('./routes/bannerRoutes') },
  // Hailie
  { path: '/api/collaborators', router: require('./routes/collaboratorsRoutes') },
  { path: '/api/categories', router: require('./routes/categoriesRoutes') },
  { path: '/api/cart', router: require('./routes/cartRoutes') },
  { path: '/api/customizations', router: require('./routes/customizationRoutes') },
];

// Inicializar la aplicación Express
const app = express();

// Deshabilitar el encabezado X-Powered-By para evitar divulgar información de la tecnología
app.disable('x-powered-by');

// Configurar trust proxy (necesario si la app está detrás de un proxy como Nginx)
app.set('trust proxy', 1);

// Middleware para el manejo de JSON
app.use(express.json());

// Aplicar configuración de CORS
app.use(corsConfig);

// Aplicar limitador de tasa general a todas las rutas
app.use(generalLimiter);

// Configurar cookie-parser
app.use(cookieParser());

// Ruta para obtener un token CSRF
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ csrfToken });
});

// Aplicar protección CSRF
app.use(doubleCsrfProtection);

// Integrar Morgan con Winston para registrar solicitudes HTTP
app.use(morgan('combined', {
  stream: {
    write: (message) => logger.info(message.trim()), // Enviar logs a Winston
  },
}));

// Ruta de prueba
app.get('/', (req, res) => {
  res.send('¡Hola Mundo!');
});

// Cargar la lista de contraseñas filtradas al iniciar la aplicación
authUtils.loadPasswordList();

// Registrar todas las rutas dinámicamente
routes.forEach(({ path, router }) => {
  app.use(path, router);
});

// Middleware para manejar errores
app.use(errorHandler);

module.exports = app;