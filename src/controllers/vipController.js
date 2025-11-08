// controllers/vipController.js
const { User, Order, OrderDetail, UserBadge, Sequelize } = require('../models/Associations');
const { Op, fn, col } = require('sequelize');
const NotificationManager = require('../services/notificationManager');
const loggerUtils = require('../utils/loggerUtils');

const notificationManager = new NotificationManager();

exports.syncVipLevels = async (req, res) => {
  let t;
  let updatedCount = 0;
  let plataCount = 0;
  let oroCount = 0;

  try {
    t = await User.sequelize.transaction();

    const users = await User.findAll({
      where: { user_type: 'cliente', status: 'activo' },
      attributes: ['user_id', 'name', 'email', 'vip_level'],
      transaction: t
    });

    if (!users.length) {
      await t.commit();
      return res.json({ message: 'No hay clientes activos.', updated: 0 });
    }

    loggerUtils.logInfo(`Sincronizando VIP para ${users.length} usuarios...`);

    for (const user of users) {
      const userId = user.user_id;

      // 1. Pedidos entregados
      const completedOrders = await Order.count({
        where: { user_id: userId, order_status: 'delivered' },
        transaction: t
      });

      // 2. Pedidos únicos (variantes distintas)
      const uniqueResult = await OrderDetail.findOne({
        attributes: [
            [fn('COUNT', fn('DISTINCT', col('variant_id'))), 'unique_count']
        ],
        include: [{
            model: Order,
            where: { user_id: userId, order_status: 'delivered' },
            attributes: []
        }],
        raw: true,
        transaction: t
        });
      const uniqueOrdersCount = Number(uniqueResult?.unique_count || 0);

      // 3. Insignias
      const badgesCount = await UserBadge.count({
        where: { user_id: userId },
        transaction: t
      });

      // 4. Calcular nivel
      let newLevel = null;
      if (completedOrders >= 10 || badgesCount >= 3) {
        newLevel = 'Oro';
      } else if (completedOrders >= 7 || uniqueOrdersCount >= 5) {
        newLevel = 'Plata';
      }

      // 5. Actualizar si cambió
      if (newLevel && user.vip_level !== newLevel) {
        await User.update(
          { vip_level: newLevel },
          { where: { user_id: userId }, transaction: t }
        );

        try {
          await notificationManager.notifyVipLevel(userId, newLevel, t);
        } catch (e) {
          loggerUtils.logError(`Email VIP falló para ${userId}`);
        }

        updatedCount++;
        newLevel === 'Oro' ? oroCount++ : plataCount++;
        loggerUtils.logUserActivity(userId, 'vip_upgraded', `→ ${newLevel}`);
      }
    }

    await t.commit();
    res.json({
      message: 'VIP sincronizado',
      updated: updatedCount,
      oro: oroCount,
      plata: plataCount,
      checked: users.length
    });

  } catch (error) {
    if (t) await t.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ error: error.message });
  }
};