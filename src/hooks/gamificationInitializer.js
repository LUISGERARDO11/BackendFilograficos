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
  CLIENTE_FIEL: 1,         // Diez pedidos en total
  COMPRADOR_EXPRESS: 6     // Comprador exprés: 2 compras en el mismo día
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

    // 2️⃣ Validar compras por fecha para Comprador exprés
    const orderCreatedAt = order.created_at; // 🆕 Usar created_at en lugar de createdAt
    if (!orderCreatedAt || isNaN(orderCreatedAt)) {
      loggerUtils.logError(`⚠️ Fecha inválida en created_at para Order ID ${order.order_id}`);
      return; // Evitar ejecutar la consulta si la fecha es inválida
    }

    const startOfDay = new Date(orderCreatedAt);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(orderCreatedAt);
    endOfDay.setHours(23, 59, 59, 999);

    const dailyDeliveredOrders = await Order.count({
      where: {
        user_id: userId,
        order_status: 'delivered',
        created_at: { // 🆕 Cambiado a created_at
          [Op.between]: [startOfDay, endOfDay]
        }
      },
      transaction
    });
    loggerUtils.logInfo(`📅 Pedidos entregados el día ${startOfDay.toDateString()} para usuario ${userId}: ${dailyDeliveredOrders}`);

    // 3️⃣ Verificar pedidos únicos (por variantes)
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

    // 4️⃣ Verificar si el pedido actual tiene personalización aprobada
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

    // 5️⃣ Asignar insignias
    let assignedBadges = [];

    // Cliente Fiel (10 pedidos)
    if (completedOrdersCount === 10) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
        assignedBadges.push('CLIENTE_FIEL');
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CLIENTE_FIEL' (pedidos completados: ${completedOrdersCount}/10).`);
    }

    // Cinco Pedidos Únicos
    if (uniqueOrdersCount >= 5) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
        assignedBadges.push('CINCO_PEDIDOS');
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CINCO_PEDIDOS' (únicos: ${uniqueOrdersCount}/5).`);
    }

    // Primer Pedido Personalizado
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

    // Comprador Exprés: 2+ pedidos en el mismo día
    if (dailyDeliveredOrders >= 2) {
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.COMPRADOR_EXPRESS, transaction);
      if (userBadge) {
        await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.COMPRADOR_EXPRESS, transaction);
        assignedBadges.push('COMPRADOR_EXPRESS');
        loggerUtils.logInfo(`🚀 ¡Insignia COMPRADOR_EXPRESS asignada! Usuario ${userId} tiene ${dailyDeliveredOrders} pedidos en el día.`);
      } else {
        loggerUtils.logInfo(`ℹ️ Usuario ${userId} ya tenía COMPRADOR_EXPRESS para este criterio.`);
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'COMPRADOR_EXPRESS' (pedidos del día: ${dailyDeliveredOrders}/2).`);
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