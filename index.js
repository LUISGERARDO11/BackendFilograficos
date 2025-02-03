/**
 * The function starts a server by connecting to a database and listening on a specified port.
 */
require('dotenv').config();
const app = require("./src/app"); // Importar la configuración de la app
const sequelize = require('./src/config/dataBase');
const logger = require('./src/config/logger'); // Usar logger en lugar de console.log
const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Autenticar la conexión a la base de datos
        await sequelize.authenticate();
        logger.info('✅ Conexión a la base de datos establecida correctamente.');

        // Sincronizar los modelos con la base de datos
        await sequelize.sync({ alter: true }); // En lugar de { force: true }
        logger.info('✅ Modelos sincronizados con la base de datos.');

        // Iniciar el servidor
        app.listen(PORT, () => logger.info(`🚀 Servidor corriendo en puerto ${PORT}`));
    } catch (error) {
        logger.error('❌ Error al iniciar el servidor:', error);
        process.exit(1); // Detiene el proceso en caso de fallo crítico
    }
}

startServer();
