const { CommunicationPreference, NotificationLog, PushSubscription } = require('../models/Associations'); // Añadimos PushSubscription
const loggerUtils = require('../utils/loggerUtils');

// Controlador para obtener las preferencias de comunicación de un usuario
exports.getCommunicationPreferences = async (req, res) => {
  const userId = req.user.user_id; 

  try {
    const preferences = await CommunicationPreference.findOne({
      where: { user_id: userId }
    });

    if (!preferences) {
      // Si no existe, devolvemos las preferencias por defecto con categorías en false
      return res.status(200).json({
        success: true,
        preferences: {
          methods: ['email'],
          categories: {
            special_offers: false,
            event_reminders: false,
            news_updates: false,
            order_updates: false,
            urgent_orders: false,
            design_reviews: false,
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
      : ['email'];

    // Validar que categories sea un objeto válido
    const defaultCategories = {
      special_offers: false,
      event_reminders: false,
      news_updates: false,
      order_updates: false,
      urgent_orders: false,
      design_reviews: false,
      stock_alerts: false
    };
    const updatedCategories = categories && typeof categories === 'object'
      ? { ...defaultCategories, ...categories } // Mezclamos con valores por defecto
      : defaultCategories;

    // Verificar consistencia con PushSubscription
    const hasPush = updatedMethods.includes('push');
    const pushSubscriptions = await PushSubscription.findAll({ where: { user_id: userId } });

    if (hasPush && pushSubscriptions.length === 0) {
      // Si se intenta incluir 'push' pero no hay suscripciones, rechazamos la actualización
      return res.status(400).json({
        success: false,
        message: 'No se puede incluir "push" en methods sin una suscripción activa en PushSubscription'
      });
    }

    if (!hasPush && pushSubscriptions.length > 0) {
      // Si 'push' no está en methods pero hay suscripciones, las eliminamos
      await PushSubscription.destroy({ where: { user_id: userId } });
      loggerUtils.logUserActivity(userId, 'remove_push_subscriptions', `Suscripciones push eliminadas para el usuario ${userId} al quitar "push" de methods`);
    }

    if (preferences) {
      await preferences.update({
        methods: updatedMethods,
        categories: updatedCategories,
        updated_at: new Date()
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