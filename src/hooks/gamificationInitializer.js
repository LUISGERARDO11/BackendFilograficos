const BadgeService = require('../services/BadgeService');
const NotificationManager = require('../services/notificationManager');
const { Order, Customization, OrderDetail } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const badgeService = new BadgeService();
const notificationManager = new NotificationManager();
const { Op, Sequelize } = require('sequelize');

const BADGE_IDS = {
  PRIMER_PERSONALIZADO: 3, // Primer pedido personalizado
  CINCO_PEDIDOS: 5,        // Cinco pedidos únicos
  CLIENTE_FIEL: 1          // Diez pedidos en total
};

async function checkGamificationOnOrderDelivered(order, options) {
  loggerUtils.logInfo(`🔔 Hook de gamificación activado para Order ID: ${order.order_id}`);

  // Verificamos si el estado cambió a 'delivered'
  if (order.order_status !== 'delivered') {
    loggerUtils.logInfo(`⚠️ Pedido ${order.order_id} no está en estado 'delivered' (estado actual: ${order.order_status}). Hook no aplica.`);
    return;
  }

  if (order.previous('order_status') === 'delivered') {
    loggerUtils.logInfo(`ℹ️ Pedido ${order.order_id} ya estaba entregado anteriormente. No se ejecutará nuevamente.`);
    return;
  }

  const userId = order.user_id;
  const transaction = options.transaction;

  loggerUtils.logInfo(`🎯 Evaluando insignias para el usuario ${userId} (Order ID ${order.order_id})`);

  try {
    // 1️⃣ Contar pedidos completados
    const completedOrdersCount = await Order.count({
      where: { user_id: userId, order_status: 'delivered' },
      transaction
    });
    loggerUtils.logInfo(`📦 Total de pedidos completados del usuario ${userId}: ${completedOrdersCount}`);

    // 2️⃣ Verificar pedidos únicos (por variantes)
    const uniqueVariants = await Order.findAll({
      where: { user_id: userId, order_status: 'delivered' },
      attributes: [],
      include: [{
        model: OrderDetail,
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('variant_id')), 'variant_id']],
        required: true
      }],
      raw: true,
      transaction
    });
    const uniqueOrdersCount = uniqueVariants.length;
    loggerUtils.logInfo(`🧩 Pedidos únicos (variantes distintas) del usuario ${userId}: ${uniqueOrdersCount}`);

    // 3️⃣ Verificar si el pedido actual tiene personalización aprobada
    const hasCustomization = await Order.findOne({
      where: { order_id: order.order_id, order_status: 'delivered' },
      include: [{
        model: Customization,
        where: { status: 'approved' },
        required: true
      }],
      transaction
    });
    loggerUtils.logInfo(`🎨 Pedido ${order.order_id} ${hasCustomization ? 'tiene' : 'no tiene'} personalizaciones aprobadas.`);

    // 4️⃣ Intentar asignar insignias
    let assignedBadges = [];

    if (completedOrdersCount === 10) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
        assignedBadges.push('CLIENTE_FIEL');
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CLIENTE_FIEL' (pedidos completados: ${completedOrdersCount}/10).`);
    }

    if (uniqueOrdersCount >= 5) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
        assignedBadges.push('CINCO_PEDIDOS');
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CINCO_PEDIDOS' (únicos: ${uniqueOrdersCount}/5).`);
    }

    if (completedOrdersCount === 1 && hasCustomization) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.PRIMER_PERSONALIZADO, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.PRIMER_PERSONALIZADO, transaction);
        assignedBadges.push('PRIMER_PERSONALIZADO');
      }
    } else {
      loggerUtils.logInfo(
        `🚫 No se asignó 'PRIMER_PERSONALIZADO' (pedidos completados: ${completedOrdersCount}, tiene personalización: ${!!hasCustomization}).`
      );
    }

    if (assignedBadges.length > 0) {
      loggerUtils.logInfo(`🏅 Insignias asignadas al usuario ${userId}: ${assignedBadges.join(', ')}`);
    } else {
      loggerUtils.logInfo(`ℹ️ No se asignaron insignias nuevas al usuario ${userId}.`);
    }

  } catch (error) {
    loggerUtils.logCriticalError(error, `💥 Error en hook de gamificación para Order ID ${order.order_id}`);
  }
}

exports.setupGamificationHooks = () => {
  Order.addHook('afterUpdate', 'checkGamification', checkGamificationOnOrderDelivered);
  loggerUtils.logInfo('✅ Hooks de Gamificación registrados en el modelo Order.');
};