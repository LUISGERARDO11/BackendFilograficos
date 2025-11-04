const { Order, Customization, OrderDetail, Product, Category, ProductVariant, Review } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op, Sequelize } = require('sequelize');
const BADGE_IDS = {
  PRIMER_PERSONALIZADO: 3, // Primer pedido personalizado
  CINCO_PEDIDOS: 5, // Cinco pedidos únicos
  CLIENTE_FIEL: 1, // Diez pedidos en total
  COMPRADOR_EXPRESS: 6, // Comprador exprés: 2 compras en el mismo día
  COLECCIONISTA: 7, // Coleccionista: 3+ productos distintos en una categoría
  PRIMER_RESENA: 8, // Primer Reseñador: Primera reseña
  RESENADOR_EXPERTO: 9 // Reseñador Experto: 10 reseñas en diferentes productos (reemplaza 9 con ID real)
};

async function checkGamificationOnOrderDelivered(order, options, badgeService, notificationManager) {
  loggerUtils.logInfo(`🔔 Hook de gamificación activado para Order ID: ${order.order_id}`);
  if (order.order_status !== 'delivered') {
    loggerUtils.logInfo(`⚠️ Pedido ${order.order_id} no está en estado 'delivered' (estado actual: ${order.order_status}). Hook no aplica.`);
    return;
  }
  if (order.previous('order_status') === 'delivered') {
    loggerUtils.logInfo(`Pedido ${order.order_id} ya estaba entregado anteriormente. No se ejecutará nuevamente.`);
    return;
  }
  const userId = order.user_id;
  const transaction = options.transaction;
  const assignedBadges = [];
  loggerUtils.logInfo(`🎯 Evaluando insignias para el usuario ${userId} (Order ID ${order.order_id})`);
  try {
    // 1️⃣ Contar pedidos completados
    const completedOrdersCount = await Order.count({
      where: { user_id: userId, order_status: 'delivered' },
      transaction
    });
    loggerUtils.logInfo(`📦 Total de pedidos completados del usuario ${userId}: ${completedOrdersCount}`);
    // 2️⃣ Validar compras por fecha para Comprador exprés
    const orderCreatedAt = order.created_at;
    if (!orderCreatedAt || isNaN(orderCreatedAt)) {
      loggerUtils.logError(`⚠️ Fecha inválida en created_at para Order ID ${order.order_id}`);
      return;
    }
    const startOfDay = new Date(orderCreatedAt);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(orderCreatedAt);
    endOfDay.setHours(23, 59, 59, 999);
    const dailyDeliveredOrders = await Order.count({
      where: {
        user_id: userId,
        order_status: 'delivered',
        created_at: { [Op.between]: [startOfDay, endOfDay] }
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
        required: false
      }],
      transaction
    });
    const hasApprovedCustomization = hasCustomization && hasCustomization.Customizations && hasCustomization.Customizations.length > 0;
    loggerUtils.logInfo(`🎨 Pedido ${order.order_id} ${hasApprovedCustomization ? 'tiene' : 'no tiene'} personalizaciones aprobadas.`);
    // 5️⃣ Verificar Coleccionista: 3+ productos distintos en la misma categoría
    const productsByCategory = await Order.findAll({
      where: { user_id: userId, order_status: 'delivered' },
      attributes: [],
      include: [{
        model: OrderDetail,
        attributes: [],
        include: [{
          model: ProductVariant,
          attributes: [],
          include: [{
            model: Product,
            attributes: ['product_id', 'category_id'],
            required: true
          }],
          required: true
        }],
        required: true
      }],
      raw: true,
      transaction
    });
    const categoryProductMap = new Map();
    productsByCategory.forEach(item => {
      const categoryId = item['OrderDetails.ProductVariant.Product.category_id'];
      const productId = item['OrderDetails.ProductVariant.Product.product_id'];
      if (!categoryProductMap.has(categoryId)) {
        categoryProductMap.set(categoryId, new Set());
      }
      categoryProductMap.get(categoryId).add(productId);
    });
    const eligibleCategories = [];
    for (const [categoryId, productIds] of categoryProductMap) {
      if (productIds.size >= 3) {
        eligibleCategories.push(categoryId);
      }
    }
    loggerUtils.logInfo(`🏆 Categorías elegibles para Coleccionista (3+ productos): ${eligibleCategories.join(', ')}`);
    // 6️⃣ Asignar insignias
    // Cliente Fiel (10 pedidos)
    if (completedOrdersCount === 10 && !assignedBadges.includes('CLIENTE_FIEL')) {
      console.log(`[DEBUG] Attempting to assign CLIENTE_FIEL for userId=${userId}`);
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
      console.log(`[DEBUG] userBadge for CLIENTE_FIEL: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for CLIENTE_FIEL with userId=${userId}, badgeId=${BADGE_IDS.CLIENTE_FIEL}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CLIENTE_FIEL, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for CLIENTE_FIEL completed successfully`);
          assignedBadges.push('CLIENTE_FIEL');
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${BADGE_IDS.CLIENTE_FIEL} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for CLIENTE_FIEL: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia CLIENTE_FIEL: ${error.message}`);
        }
      } else {
        console.log(`[DEBUG] No userBadge returned for CLIENTE_FIEL`);
        loggerUtils.logInfo(`🚫 No se asignó 'CLIENTE_FIEL' porque userBadge es null`);
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CLIENTE_FIEL' (pedidos completados: ${completedOrdersCount}/10).`);
    }
    // Cinco Pedidos Únicos
    if (uniqueOrdersCount >= 5 && !assignedBadges.includes('CINCO_PEDIDOS')) {
      console.log(`[DEBUG] Attempting to assign CINCO_PEDIDOS for userId=${userId}`);
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
      console.log(`[DEBUG] userBadge for CINCO_PEDIDOS: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for CINCO_PEDIDOS with userId=${userId}, badgeId=${BADGE_IDS.CINCO_PEDIDOS}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.CINCO_PEDIDOS, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for CINCO_PEDIDOS completed successfully`);
          assignedBadges.push('CINCO_PEDIDOS');
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${BADGE_IDS.CINCO_PEDIDOS} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for CINCO_PEDIDOS: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia CINCO_PEDIDOS: ${error.message}`);
        }
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'CINCO_PEDIDOS' (únicos: ${uniqueOrdersCount}/5).`);
    }
    // Primer Pedido Personalizado
    if (completedOrdersCount === 1 && hasApprovedCustomization && !assignedBadges.includes('PRIMER_PERSONALIZADO')) {
      console.log(`[DEBUG] Attempting to assign PRIMER_PERSONALIZADO for userId=${userId}`);
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.PRIMER_PERSONALIZADO, transaction);
      console.log(`[DEBUG] userBadge for PRIMER_PERSONALIZADO: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for PRIMER_PERSONALIZADO with userId=${userId}, badgeId=${BADGE_IDS.PRIMER_PERSONALIZADO}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.PRIMER_PERSONALIZADO, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for PRIMER_PERSONALIZADO completed successfully`);
          assignedBadges.push('PRIMER_PERSONALIZADO');
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${BADGE_IDS.PRIMER_PERSONALIZADO} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for PRIMER_PERSONALIZADO: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia PRIMER_PERSONALIZADO: ${error.message}`);
        }
      }
    } else {
      loggerUtils.logInfo(
        `🚫 No se asignó 'PRIMER_PERSONALIZADO' (pedidos completados: ${completedOrdersCount}, tiene personalización: ${hasApprovedCustomization}).`
      );
    }
    // Comprador Exprés: 2+ pedidos en el mismo día
    if (dailyDeliveredOrders >= 2 && !assignedBadges.includes('COMPRADOR_EXPRESS')) {
      console.log(`[DEBUG] Attempting to assign COMPRADOR_EXPRESS for userId=${userId}`);
      const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.COMPRADOR_EXPRESS, transaction);
      console.log(`[DEBUG] userBadge for COMPRADOR_EXPRESS: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for COMPRADOR_EXPRESS with userId=${userId}, badgeId=${BADGE_IDS.COMPRADOR_EXPRESS}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.COMPRADOR_EXPRESS, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for COMPRADOR_EXPRESS completed successfully`);
          assignedBadges.push('COMPRADOR_EXPRESS');
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${BADGE_IDS.COMPRADOR_EXPRESS} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for COMPRADOR_EXPRESS: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia COMPRADOR_EXPRESS: ${error.message}`);
        }
      }
    } else {
      loggerUtils.logInfo(`🚫 No se asignó 'COMPRADOR_EXPRESS' (pedidos del día: ${dailyDeliveredOrders}/2).`);
    }
    // Coleccionista: 3+ productos distintos en una categoría
    for (const categoryId of eligibleCategories) {
      if (!assignedBadges.includes(`COLECCIONISTA_${categoryId}`)) {
        console.log(`[DEBUG] Attempting to assign COLECCIONISTA for userId=${userId}, categoryId=${categoryId}`);
        const userBadge = await badgeService.assignBadgeById(userId, BADGE_IDS.COLECCIONISTA, transaction, { category_id: categoryId });
        console.log(`[DEBUG] userBadge for COLECCIONISTA (category ${categoryId}): ${JSON.stringify(userBadge)}`);
        if (userBadge) {
          console.log(`[DEBUG] Calling notifyBadgeAssignment for COLECCIONISTA with userId=${userId}, badgeId=${BADGE_IDS.COLECCIONISTA}, categoryId=${categoryId}`);
          try {
            const category = await Category.findByPk(categoryId, { attributes: ['name'], transaction });
            await notificationManager.notifyBadgeAssignment(userId, BADGE_IDS.COLECCIONISTA, transaction, { categoryName: category?.name });
            console.log(`[DEBUG] notifyBadgeAssignment for COLECCIONISTA completed successfully`);
            assignedBadges.push(`COLECCIONISTA (Categoría: ${category?.name || categoryId})`);
            loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${BADGE_IDS.COLECCIONISTA} asignada para categoría ${category?.name || categoryId}`);
          } catch (error) {
            console.log(`[DEBUG] Error in notifyBadgeAssignment for COLECCIONISTA: ${error.message}`);
            loggerUtils.logError(`Error al notificar insignia COLECCIONISTA: ${error.message}`);
          }
        }
      }
    }
    if (assignedBadges.length > 0) {
      loggerUtils.logInfo(`🏅 Insignias asignadas al usuario ${userId}: ${assignedBadges.join(', ')}`);
    } else {
      loggerUtils.logInfo(`ℹ️ No se asignaron insignias nuevas al usuario ${userId}.`);
    }
  } catch (error) {
    console.log(`[DEBUG] Critical error in checkGamificationOnOrderDelivered: ${error.message}`);
    loggerUtils.logCriticalError(error, `💥 Error en hook de gamificación para Order ID ${order.order_id}`);
  }
}

async function checkGamificationOnReviewCreate(review, options, badgeService, notificationManager) {
  const transaction = options.transaction;
  const userId = review.user_id;
  try {
    const totalReviews = await Review.count({
      where: { user_id: userId },
      transaction
    });
    const uniqueProductsReviewed = await Review.count({
      where: { user_id: userId },
      distinct: true,
      col: 'product_id',
      transaction
    });

    // Primer Reseñador
    if (totalReviews === 1) {
      loggerUtils.logInfo(`Primera reseña detectada para userId=${userId}`);
      const badgeId = BADGE_IDS.PRIMER_RESENA;
      const userBadge = await badgeService.assignBadgeById(userId, badgeId, transaction);
      console.log(`[DEBUG] userBadge for PRIMER_RESENA: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for PRIMER_RESENA with userId=${userId}, badgeId=${badgeId}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, badgeId, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for PRIMER_RESENA completed successfully`);
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${badgeId} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for PRIMER_RESENA: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia PRIMER_RESENA: ${error.message}`);
        }
      } else {
        console.log(`[DEBUG] No userBadge returned for PRIMER_RESENA`);
        loggerUtils.logInfo(`🚫 No se asignó 'PRIMER_RESENA' porque userBadge es null`);
      }
    }

    // Reseñador Experto (10 reseñas en diferentes productos)
    if (uniqueProductsReviewed === 10) {
      loggerUtils.logInfo(`10 reseñas únicas detectadas para userId=${userId}`);
      const badgeId = BADGE_IDS.RESENADOR_EXPERTO;
      const userBadge = await badgeService.assignBadgeById(userId, badgeId, transaction);
      console.log(`[DEBUG] userBadge for RESENADOR_EXPERTO: ${JSON.stringify(userBadge)}`);
      if (userBadge) {
        console.log(`[DEBUG] Calling notifyBadgeAssignment for RESENADOR_EXPERTO with userId=${userId}, badgeId=${badgeId}`);
        try {
          await notificationManager.notifyBadgeAssignment(userId, badgeId, transaction);
          console.log(`[DEBUG] notifyBadgeAssignment for RESENADOR_EXPERTO completed successfully`);
          loggerUtils.logUserActivity(userId, 'assign_badge', `Insignia ${badgeId} asignada`);
        } catch (error) {
          console.log(`[DEBUG] Error in notifyBadgeAssignment for RESENADOR_EXPERTO: ${error.message}`);
          loggerUtils.logError(`Error al notificar insignia RESENADOR_EXPERTO: ${error.message}`);
        }
      } else {
        console.log(`[DEBUG] No userBadge returned for RESENADOR_EXPERTO`);
        loggerUtils.logInfo(`🚫 No se asignó 'RESENADOR_EXPERTO' porque userBadge es null`);
      }
    } else {
      loggerUtils.logInfo(`🚫 No aplica 'RESENADOR_EXPERTO' (reseñas únicas: ${uniqueProductsReviewed}/10) para userId=${userId}`);
    }
  } catch (error) {
    console.log(`[DEBUG] Critical error in checkGamificationOnReviewCreate: ${error.message}`);
    loggerUtils.logCriticalError(error, `💥 Error en hook de gamificación para Review ID ${review.review_id}`);
  }
}

function setupGamificationHooks(badgeService, notificationManager) {
  if (!badgeService || !notificationManager) {
    throw new Error('badgeService and notificationManager are required');
  }
  Order.addHook('afterUpdate', 'checkGamification', (order, options) =>
    checkGamificationOnOrderDelivered(order, options, badgeService, notificationManager));
  Review.addHook('afterCreate', 'checkGamificationReview', (review, options) =>
    checkGamificationOnReviewCreate(review, options, badgeService, notificationManager));
  loggerUtils.logInfo('✅ Hooks de Gamificación registrados en los modelos Order y Review.');
}

module.exports = {
  setupGamificationHooks,
  checkGamificationOnOrderDelivered,
  checkGamificationOnReviewCreate
};