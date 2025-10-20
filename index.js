/**
 * The function starts a server by connecting to a database and listening on a specified port.
 */
require('dotenv').config();
process.env.TZ = 'UTC'; // Forzar UTC en el proceso de Node.js
const app = require("./src/app"); // Importar la configuración de la app
const sequelize = require('./src/config/dataBase');
const logger = require('./src/config/logger'); // Usar logger en lugar de console.log
const { setupGamificationHooks } = require('./src/hooks/gamificationInitializer');
const BadgeService = require('./src/services/BadgeService');
const NotificationManager = require('./src/services/notificationManager');

const PORT = process.env.PORT || 3000;

async function startServer() {
    try {
        // Autenticar la conexión a la base de datos
        await sequelize.authenticate();
        console.log('Conexión a la base de datos establecida correctamente.');

        // Sincronizar los modelos con la base de datos
        if (process.env.NODE_ENV !== 'production') {
            sequelize.sync({ alter: true }) // Solo en desarrollo
              .then(() => console.log('Base de datos sincronizada'))
              .catch(error => console.error('Error al sincronizar:', error));
        }
        // Instanciar servicios
        const badgeService = new BadgeService();
        const notificationManager = new NotificationManager();

        // **PASO CLAVE: Registrar los hooks después de la conexión y definición de modelos**
        setupGamificationHooks(badgeService, notificationManager);

        // Iniciar el servidor
        app.listen(PORT, () => {
            console.log(`Servidor corriendo en el puerto ${PORT}`);
        });
    } catch (error) {
        console.log('Error al iniciar el servidor:', error);
        process.exit(1); // Detiene el proceso en caso de fallo crítico
    }
}

startServer();