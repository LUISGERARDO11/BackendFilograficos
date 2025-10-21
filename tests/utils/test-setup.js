// Configuración inicial para entorno de pruebas
require('dotenv').config({ path: './tests/.env.test' });
process.env.NODE_ENV = 'test';
process.env.TZ = 'UTC';

// Evitar que cronjobs u otros procesos se ejecuten durante las pruebas
jest.mock('node-cron', () => ({
  schedule: jest.fn(),
}));

// Mock de la conexión a la base de datos
jest.mock('../../src/config/dataBase', () => ({
  authenticate: jest.fn().mockResolvedValue(),
  sync: jest.fn().mockResolvedValue(),
  query: jest.fn().mockResolvedValue([[{ currentTime: new Date() }]]),
  close: jest.fn().mockResolvedValue(),
}));