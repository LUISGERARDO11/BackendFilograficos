/**
 * The code establishes a connection to a MySQL database using Sequelize and tests the connection for
 * success.
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');

// Configuración de la conexión con Sequelize
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql',
  dialectModule: require('mysql2'),
  dialectOptions: {
    ssl: process.env.DB_SSL_CA 
      ? { ca: Buffer.from(process.env.DB_SSL_CA, 'utf-8') } 
      : undefined
  }
});

/*const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD, {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'mysql'
});*/

// Probar la conexión
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Conexión exitosa a la base de datos MySQL en Aiven');
  } catch (error) {
    console.error('Error al conectar a la base de datos:', error);
  }
}

testConnection();

module.exports = sequelize;