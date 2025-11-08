const express = require('express');
const cookieParser = require('cookie-parser');
const corsConfig = require('./src/config/corsConfig');
const { doubleCsrfProtection, generateToken } = require('./src/config/csrfConfig');

// === MOCKS PARA TESTS (mantener compatibilidad multi-módulo) ===
jest.mock('./src/config/csrfConfig', () => ({
  generateToken: jest.fn(() => 'mock-csrf-token'),
  doubleCsrfProtection: jest.fn((req, res, next) => next()) // DESHABILITA CSRF en tests
}));

const errorHandler = require('./src/middlewares/errorHandler');
const { generalLimiter } = require('./src/middlewares/expressRateLimit');
const logger = require('./src/config/logger');
const morgan = require('morgan');
const { Sequelize } = require('sequelize');
require('dotenv').config({ path: 'tests/.env.test' });

// --- Definición de Mock Instance ---
// Helper para simular una instancia de Sequelize con métodos de instancia
const mockInstance = (data) => ({
    // Propiedades de datos
    ...data,
    dataValues: data,
    
    // Métodos de instancia esenciales para el hook/tests de integración
    // update: Usado por tests para cambiar el estado de Order
    update: jest.fn(function(newValues) {
        Object.assign(this.dataValues, newValues);
        Object.assign(this, newValues);
        return Promise.resolve(this);
    }),
    // previous: Usado por el hook checkGamificationOnOrderDelivered
    previous: jest.fn(function(key) {
        // En los tests de Order, asumimos que el estado anterior siempre era 'shipped'
        if (this.order_status === 'delivered' && key === 'order_status') {
             return 'shipped';
        }
        return undefined;
    }),
    get: jest.fn(function () { return this.dataValues || this; }),
});


// Crear una instancia mockeada de Sequelize
const mockSequelize = {
  authenticate: jest.fn().mockResolvedValue(),
  sync: jest.fn().mockResolvedValue(),
  close: jest.fn().mockResolvedValue(),
  
  // --- CORRECCIÓN EN define: Añadimos bulkCreate y mejoramos create ---
  define: jest.fn((modelName, attributes, options) => ({
    modelName,
    attributes,
    options,
    // create: Devuelve una instancia mockeada para que tenga el método .update()
    create: jest.fn(function(data) {
        return Promise.resolve(mockInstance(data));
    }),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    // bulkCreate: Simulado para que no falle el test de insignias
    bulkCreate: jest.fn().mockResolvedValue([]), 
    belongsTo: jest.fn(),
    hasOne: jest.fn(),
    hasMany: jest.fn(),
    belongsToMany: jest.fn(),
    addHook: jest.fn(),
  })),
  query: jest.fn().mockResolvedValue([[{ currentTime: new Date() }]]),
};

// Mockear la conexión de base de datos
jest.mock('./src/config/dataBase', () => mockSequelize);

// Mockear transporter
jest.mock('./src/config/transporter', () => ({
  sendMail: jest.fn().mockResolvedValue({ messageId: 'mock-message-id' }),
}));

// Corrección del mock de EmailService como clase
jest.mock('./src/services/emailService', () => {
  return jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendMFAOTPEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendBadgeNotification: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendOTPEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendPasswordChangeNotification: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendUserSupportEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    notifyStockEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    sendCouponEmail: jest.fn().mockResolvedValue({ success: true, messageId: 'mock-message-id' }),
    getEmailTemplate: jest.fn().mockResolvedValue({
      html_content: '<p>Mocked HTML</p>',
      text_content: 'Mocked Text',
      subject: 'Mocked Subject',
    }),
  }));
});

// Mockear otros servicios externos
jest.mock('./src/services/cloudinaryService', () => ({
  uploadBadgeIconToCloudinary: jest.fn().mockResolvedValue({ secure_url: 'http://example.com/icon.png', public_id: 'badge_7' }),
  deleteFromCloudinary: jest.fn().mockResolvedValue(),
}));

// Mockear ejs
jest.mock('ejs', () => ({
  render: jest.fn().mockImplementation((template) => template),
}));

// Mockear authService
jest.mock('./src/services/authService', () => ({
  hashPassword: jest.fn().mockResolvedValue('mocked_hash'),
  verifyPassword: jest.fn().mockResolvedValue(true),
  isUserBlocked: jest.fn().mockResolvedValue({ blocked: false }),
  handleFailedAttempt: jest.fn().mockResolvedValue({ locked: false }),
  clearFailedAttempts: jest.fn().mockResolvedValue(),
  createSession: jest.fn().mockResolvedValue({ token: 'mocked_token', session: {} }),
  getConfig: jest.fn().mockResolvedValue({
    email_verification_lifetime: 3600,
    otp_lifetime: 300,
    session_lifetime: 900,
  }),
  verifyJWT: jest.fn().mockResolvedValue({
    success: true,
    data: { user_id: 1, user_type: 'cliente' },
    session: { browser: 'web' },
    message: 'Token válido',
  }),
  extendSession: jest.fn().mockResolvedValue('mocked_token'),
}));

// --- CORRECCIÓN EN authMiddleware ---
// Cambiamos el mock de 'administrador' a 'cliente' (user_id 1) 
// para que el profile endpoint funcione con el token.
jest.mock('./src/middlewares/authMiddleware', () => jest.fn((req, res, next) => {
  req.user = { user_id: 1, user_type: 'cliente' };
  next();
}));

jest.mock('./src/middlewares/roleMiddleware', () => jest.fn((roles) => (req, res, next) => next()));

jest.mock('./src/middlewares/verifyTokenExpiration', () => ({
  verifyTokenExpiration: jest.fn((req, res, next) => next())
}));

// Importar rutas
const routes = [
  { path: '/api/auth', router: require('./src/routes/authRoutes') },
  { path: '/api/users', router: require('./src/routes/userRoutes') },
  { path: '/api/badges', router: require('./src/routes/badgeRoutes') },
  { path: '/api/models3d', router: require('./src/routes/models3dRoutes') },
];

// Inicializar la aplicación Express para pruebas
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  req.timezone = 'America/Mexico_City';
  next();
});
app.use(corsConfig);
app.use(generalLimiter);
app.use(cookieParser());
app.get('/api/csrf-token', (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ csrfToken });
});
app.use(require('./src/config/csrfConfig').doubleCsrfProtection);
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));
routes.forEach(({ path, router }) => {
  app.use(path, router);
});
app.use(errorHandler);

module.exports = { app, sequelize: mockSequelize };