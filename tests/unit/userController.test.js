// tests/unit/userController.test.js
const {
  getProfile,
  getTopClients,
} = require('../../src/controllers/userController');
const {
  User, Address, Account, UserBadge, Badge, BadgeCategory, Category, Order,
} = require('../../src/models/Associations');
const { Sequelize } = require('sequelize');
const { checkGamificationOnOrderDelivered } = require('../../src/hooks/gamificationInitializer');
const BadgeService = require('../../src/services/BadgeService');
const NotificationManager = require('../../src/services/notificationManager');
const loggerUtils = require('../../src/utils/loggerUtils');

jest.mock('../../src/models/Associations');
jest.mock('../../src/utils/loggerUtils');
jest.mock('../../src/services/BadgeService');
jest.mock('../../src/services/notificationManager');

// Mock de Sequelize para user.get({ plain: true })
User.prototype.get = jest.fn(function () {
  return this.dataValues || this;
});

const mockReq = (user) => ({ user: { user_id: user.user_id } });
const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('UserController - Unit', () => {
  let badgeService, notificationManager, transaction;

  beforeEach(() => {
    jest.clearAllMocks();
    badgeService = new BadgeService();
    notificationManager = new NotificationManager();
    transaction = { commit: jest.fn(), rollback: jest.fn() };

    // Mock globales: se usarán en todos los tests a menos que se sobrescriban
    Order.count.mockImplementation(() => Promise.resolve(10));
    UserBadge.count.mockResolvedValue(0);
    Order.findAll.mockImplementation(() => Promise.resolve(Array(6).fill({})));
    User.findByPk.mockImplementation((id) => {
      if (id === 1) return Promise.resolve({ user_id: 1, vip_level: null, get: () => ({ vip_level: null }) });
      return Promise.resolve(null);
    });
    User.update = jest.fn().mockResolvedValue([1]);
  });

  // getProfile
  it('getProfile devuelve perfil con badges y categoría Coleccionista', async () => {
    const user = {
      user_id: 1, name: 'Ana', email: 'ana@x.com', vip_level: 'Oro',
      Addresses: [{ address_id: 1, is_primary: true }],
      Account: { profile_picture_url: 'foto.jpg' },
      UserBadges: [
        {
          obtained_at: new Date(),
          category_id: 5,
          Badge: {
            badge_id: 7, name: 'Coleccionista', icon_url: 'c.jpg',
            BadgeCategory: { name: 'Ropa' },
          },
          Category: { name: 'Ropa' },
        },
      ],
    };
    User.findByPk.mockResolvedValue({ ...user, get: User.prototype.get }); 
    const req = mockReq({ user_id: 1 });
    const res = mockRes();

    await getProfile(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      user_id: 1,
      name: 'Ana',
      vip_level: 'Oro',
      badges: expect.arrayContaining([
        expect.objectContaining({
          id: 7,
          name: 'Coleccionista',
          product_category: 'Ropa',
        }),
      ]),
    }));
  });

  // getTopClients (YA CORREGIDO)
  it('getTopClients devuelve Oro (15) + Plata (20) ordenados', async () => {
    const oro = Array(15).fill(null).map((_, i) => ({
      user_id: 100 + i,
      name: `Oro${i + 1}`,
      vip_level: 'Oro',
      Account: { profile_picture_url: 'oro.jpg' },
      dataValues: {
        user_id: 100 + i,
        name: `Oro${i + 1}`,
        vip_level: 'Oro',
        Account: { profile_picture_url: 'oro.jpg' },
        total_orders_completed: 30,
        total_badges_obtained: 5,
      },
      get: User.prototype.get, 
    }));

    const plata = Array(20).fill(null).map((_, i) => ({
      user_id: 200 + i,
      name: `Plata${i + 1}`,
      vip_level: 'Plata',
      Account: { profile_picture_url: 'plata.jpg' },
      dataValues: {
        user_id: 200 + i,
        name: `Plata${i + 1}`,
        vip_level: 'Plata',
        Account: { profile_picture_url: 'plata.jpg' },
        total_orders_completed: 15,
        total_badges_obtained: 3,
      },
      get: User.prototype.get, 
    }));

    User.findAll.mockResolvedValueOnce(oro).mockResolvedValueOnce(plata);

    const req = {}, res = mockRes();
    await getTopClients(req, res);

    expect(User.findAll).toHaveBeenCalledTimes(2);
    expect(res.json).toHaveBeenCalledWith({
      message: expect.any(String),
      topClients: expect.arrayContaining([
        expect.objectContaining({ vip_level: 'Oro' }),
        expect.objectContaining({ vip_level: 'Plata' }),
      ]),
    });
  });

  // Hook VIP Level (CORREGIDO)
    it('Hook actualiza a Oro (10 pedidos) y notifica', async () => {
        Order.count
            .mockResolvedValueOnce(10)  // completedOrdersCount
            .mockResolvedValueOnce(2)   // dailyDeliveredOrders
            .mockResolvedValueOnce(10); // orders finales
        UserBadge.count.mockResolvedValue(0);
        Order.findAll.mockImplementation(() => Promise.resolve(Array(6).fill({})));

        const order = {
            order_id: 10,
            user_id: 1,
            order_status: 'delivered',
            previous: jest.fn().mockReturnValue('shipped'),
            created_at: new Date(),
        };

        await checkGamificationOnOrderDelivered(
            order, { transaction }, badgeService, notificationManager
        );

        expect(User.update).toHaveBeenCalledWith(
            { vip_level: 'Oro' },
            { where: { user_id: 1 }, transaction }
        );
        expect(notificationManager.notifyVipLevel).toHaveBeenCalledWith(1, 'Oro', transaction);
    });
});