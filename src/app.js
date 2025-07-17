/* This code snippet is setting up a Node.js Express application. Here's a breakdown of what it does: */
const express = require('express');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const moment = require('moment-timezone');

// Importar configuraciones
const logger = require('./config/logger');
const corsConfig = require('./config/corsConfig');
const { generateToken, doubleCsrfProtection } = require('./config/csrfConfig');

// Importar middlewares
const errorHandler = require('./middlewares/errorHandler');
const { generalLimiter } = require('./middlewares/expressRateLimit');

// Importar utilidades
const authUtils = require('./utils/authUtils');

// Importar servicio de respaldo
const backupService = require('./services/backupService');
const { BackupConfig } = require('./models/Associations');

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
  { path: '/api/order', router: require('./routes/orderRoutes') },
  { path: '/api/admin/orders', router: require('./routes/adminOrderRoutes') },
  // Hailie
  { path: '/api/collaborators', router: require('./routes/collaboratorsRoutes') },
  { path: '/api/categories', router: require('./routes/categoriesRoutes') },
  { path: '/api/cart', router: require('./routes/cartRoutes') },
  { path: '/api/customizations', router: require('./routes/customizationRoutes') },
  { path: '/api/backups', router: require('./routes/backupRoutes') },
];

// Inicializar la aplicación Express
const app = express();

// Deshabilitar el encabezado X-Powered-By para evitar divulgar información de la tecnología
app.disable('x-powered-by');

// Configurar trust proxy (necesario si la app está detrás de un proxy como Nginx)
app.set('trust proxy', 1);

// Middleware para el manejo de JSON
app.use(express.json());

app.use(express.urlencoded({ extended: true }));

// Middleware para detectar la zona horaria del cliente
app.use((req, res, next) => {
  const clientTimezone = req.headers['x-timezone'] || 'America/Mexico_City'; // Por defecto America/Mexico_City
  req.timezone = clientTimezone; // Almacenar en el objeto req para uso en controladores
  next();
});

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
app.use((req, res, next) => {
  // Excluir solicitudes de Alexa de la protección CSRF
  if (
    req.headers['x-alexa-request'] === 'true' ||
    req.path === '/api/auth/alexa/token' ||
    req.path === '/api/order/webhook/mercado-pago' // Ruta completa montada
  ) {
    return next();
  }
  // Aplicar CSRF a todas las demás solicitudes
  doubleCsrfProtection(req, res, next);
});

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

// Programar respaldos automáticos
// Full backup: Cada domingo a las 00:00 (America/Mexico_City)
cron.schedule('0 0 * * 0', async () => {
  try {
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: 'full' } });
    if (!config) {
      logger.error('No se encontró configuración para respaldo completo');
      return;
    }
    const { data_types, created_by } = config;
    await backupService.generateBackup(created_by, JSON.parse(data_types), 'full', moment().tz('UTC').format());
    logger.info(`Respaldo completo ejecutado exitosamente en ${moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')}`);
  } catch (error) {
    logger.error('Error en cron job de respaldo completo:', error);
  }
}, {
  timezone: 'America/Mexico_City' // Ejecutar según la zona horaria de México
});

// Diferencial backup: Cada noche a las 00:00, excepto domingos (America/Mexico_City)
cron.schedule('0 0 * * 1-6', async () => {
  try {
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: 'differential' } });
    if (!config) {
      logger.error('No se encontró configuración para respaldo diferencial');
      return;
    }
    const { data_types, created_by } = config;
    await backupService.generateBackup(created_by, JSON.parse(data_types), 'differential', moment().tz('UTC').format());
    logger.info(`Respaldo diferencial ejecutado exitosamente en ${moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')}`);
  } catch (error) {
    logger.error('Error en cron job de respaldo diferencial:', error);
  }
}, {
  timezone: 'America/Mexico_City' // Ejecutar según la zona horaria de México
});

/* Transaccional backup: Cada hora
cron.schedule('0 * * * *', async () => {
  try {
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: 'transactional' } });
    if (!config) {
      logger.error('No se encontró configuración para respaldo transaccional');
      return;
    }
    const { data_types, created_by } = config;
    await backupService.generateBackup(created_by, JSON.parse(data_types), 'transactional', moment().tz('UTC').format());
    logger.info(`Respaldo transaccional ejecutado exitosamente en ${moment().tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')}`);
  } catch (error) {
    logger.error('Error en cron job de respaldo transaccional:', error);
  }
}, {
  timezone: 'America/Mexico_City' // Ejecutar según la zona horaria de México
});*/

// Middleware para manejar errores
app.use(errorHandler);

module.exports = app;