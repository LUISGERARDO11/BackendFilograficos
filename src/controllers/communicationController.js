const { CommunicationPreference, NotificationLog } = require('../models/Associations'); // Importamos los modelos desde Associations.js
const loggerUtils = require('../utils/loggerUtils');

// Controlador para obtener las preferencias de comunicación de un usuario
exports.getCommunicationPreferences = async (req, res) => {
  const userId = req.user.user_id; 

  try {
    const preferences = await CommunicationPreference.findOne({
      where: { user_id: userId }
    });

    if (!preferences) {
      // Si no existe, devolvemos las preferencias por defecto
      return res.status(200).json({
        success: true,
        preferences: {
          methods: ['email'], // Email siempre obligatorio por defecto
          categories: {
            special_offers: true,
            event_reminders: true,
            news_updates: true,
            order_updates: true,
            urgent_orders: false,
            design_reviews: true,
            stock_alerts: false
          }
        }
      });
    }

    // Aseguramos que 'email' siempre esté en methods si no está presente
    const methods = preferences.methods.includes('email')
      ? preferences.methods
      : ['email', ...preferences.methods.filter(method => method !== 'email')];

    res.status(200).json({
      success: true,
      preferences: {
        methods,
        categories: preferences.categories
      }
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      success: false,
      message: 'Error al obtener las preferencias de comunicación',
      error: error.message
    });
  }
};

// Controlador para actualizar las preferencias de comunicación de un usuario
exports.updateCommunicationPreferences = async (req, res) => {
  const userId = req.user.user_id;
  const { methods, categories } = req.body;

  try {
    let preferences = await CommunicationPreference.findOne({ where: { user_id: userId } });

    // Validar que 'email' siempre esté presente en methods
    const updatedMethods = Array.isArray(methods) && methods.length > 0
      ? ['email', ...methods.filter(method => method === 'push')] // Solo permitimos 'push' como adicional
      : ['email']; // Si no se proporciona methods, usamos el valor por defecto

    // Validar que categories sea un objeto y no esté vacío
    const updatedCategories = categories && typeof categories === 'object' && Object.keys(categories).length > 0
      ? categories
      : {
          special_offers: true,
          event_reminders: true,
          news_updates: true,
          order_updates: true,
          urgent_orders: false,
          design_reviews: true,
          stock_alerts: false
        };

    if (preferences) {
      await preferences.update({
        methods: updatedMethods,
        categories: updatedCategories,
        updated_at: new Date() // Actualizamos el timestamp manualmente para forzar la actualización
      });
    } else {
      preferences = await CommunicationPreference.create({
        user_id: userId,
        methods: updatedMethods,
        categories: updatedCategories
      });
    }

    loggerUtils.logUserActivity(userId, 'update_preferences', `Preferencias actualizadas para el usuario ${userId}`);
    res.status(200).json({
      success: true,
      message: 'Preferencias de comunicación actualizadas exitosamente',
      preferences: {
        methods: preferences.methods,
        categories: preferences.categories
      }
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);

    // Registrar el error en NotificationLog si falla la actualización
    await NotificationLog.create({
      user_id: userId,
      type: 'system',
      title: 'Error al actualizar preferencias',
      message: `Fallo al actualizar preferencias para user_id: ${userId}`,
      status: 'failed',
      error_message: error.message,
      created_at: new Date()
    });

    res.status(500).json({
      success: false,
      message: 'Error al actualizar las preferencias de comunicación',
      error: error.message
    });
  }
};