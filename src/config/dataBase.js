/**
 * The code establishes a connection to a MySQL database using Sequelize.
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const env = process.env.NODE_ENV || 'development';

// Configuración de la conexión con Sequelize
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    dialectModule: require('mysql2'),
    dialectOptions: {
      ssl: process.env.DB_SSL_CA ? { ca: Buffer.from(process.env.DB_SSL_CA, 'utf-8') } : undefined,
      charset: 'utf8mb4', // Usar utf8mb4 explícitamente
      timezone: '+00:00',
    },
    timezone: '+00:00',
    pool: {
      max: 5, // Máximo de conexiones
      min: 0,
      acquire: 30000, // Timeout de 30s
      idle: 10000, // Cierre de conexiones inactivas después de 10s
    },
    logging: env === 'test' ? false : console.log, // Desactivar logging en pruebas
  }
);

// Probar la conexión (solo en entornos no de prueba)
async function testConnection() {
  if (env === 'test') return; // Evitar conexión en pruebas
  try {
    await sequelize.authenticate();
    // Verificar la zona horaria con una consulta
    const [result] = await sequelize.query('SELECT NOW() as currentTime');
    console.log('Conexión exitosa a la base de datos MySQL en Aiven');
    console.log('Hora actual del servidor (debe estar en UTC):', result[0].currentTime);
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
  }
}

if (env !== 'test') {
  testConnection();
}

module.exports = sequelize;
module.exports.testConnection = testConnection;