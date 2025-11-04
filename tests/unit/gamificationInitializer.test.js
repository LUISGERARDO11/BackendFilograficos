const { 
  setupGamificationHooks, 
  checkGamificationOnOrderDelivered,
  checkGamificationOnReviewCreate 
} = require('../../src/hooks/gamificationInitializer');
const { 
  Order, 
  Customization, 
  OrderDetail, 
  ProductVariant, 
  Product, 
  Category, 
  Review 
} = require('../../src/models/Associations');
const BadgeService = require('../../src/services/BadgeService');
const NotificationManager = require('../../src/services/notificationManager');
const loggerUtils = require('../../src/utils/loggerUtils');
const { Op, Sequelize } = require('sequelize');

// Mockear dependencias
jest.mock('../../src/models/Associations');
jest.mock('../../src/utils/loggerUtils');
jest.mock('../../src/services/BadgeService');
jest.mock('../../src/services/notificationManager');

describe('GamificationInitializer - Unit Tests', () => {
  let badgeService;
  let notificationManager;
  let mockTransaction;

  beforeEach(() => {
    badgeService = new BadgeService();
    notificationManager = new NotificationManager();
    mockTransaction = {};
    jest.clearAllMocks();

    // Mock de los modelos
    Order.count = jest.fn();
    Order.findAll = jest.fn();
    Order.findOne = jest.fn();
    OrderDetail.findAll = jest.fn();
    ProductVariant.findAll = jest.fn();
    Product.findAll = jest.fn();
    Category.findByPk = jest.fn();
    Customization.findAll = jest.fn();
    Review.count = jest.fn();
    Review.addHook = jest.fn();

    // Mock de loggerUtils
    loggerUtils.logInfo = jest.fn();
    loggerUtils.logError = jest.fn();
    loggerUtils.logCriticalError = jest.fn();
    loggerUtils.logUserActivity = jest.fn();

    // Mock de métodos de servicios
    badgeService.assignBadgeById = jest.fn();
    notificationManager.notifyBadgeAssignment = jest.fn().mockImplementation(() => {
      console.log('[DEBUG] Mock notifyBadgeAssignment called');
      return Promise.resolve();
    });
  });

  it('debería registrar hooks en Order y Review', () => {
    Order.addHook = jest.fn();
    Review.addHook = jest.fn();
    setupGamificationHooks(badgeService, notificationManager);
    
    expect(Order.addHook).toHaveBeenCalledWith('afterUpdate', 'checkGamification', expect.any(Function));
    expect(Review.addHook).toHaveBeenCalledWith('afterCreate', 'checkGamificationReview', expect.any(Function));
    expect(loggerUtils.logInfo).toHaveBeenCalledWith('✅ Hooks de Gamificación registrados en los modelos Order y Review.');
  });

  it('no debería ejecutar el hook si el estado del pedido no es "delivered"', async () => {
    const order = {
      order_id: 1,
      user_id: 1,
      order_status: 'shipped',
      previous: jest.fn().mockReturnValue('pending'),
      created_at: new Date('2025-10-14')
    };

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(`⚠️ Pedido ${order.order_id} no está en estado 'delivered' (estado actual: ${order.order_status}). Hook no aplica.`);
    expect(badgeService.assignBadgeById).not.toHaveBeenCalled();
  });

  it('no debería ejecutar el hook si el pedido ya estaba en estado "delivered"', async () => {
    const order = {
      order_id: 1,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('delivered'),
      created_at: new Date('2025-10-14')
    };

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(`Pedido ${order.order_id} ya estaba entregado anteriormente. No se ejecutará nuevamente.`);
    expect(badgeService.assignBadgeById).not.toHaveBeenCalled();
  });

  it('debería manejar errores en la base de datos y registrarlos correctamente', async () => {
    const order = {
      order_id: 1,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14')
    };

    const error = new Error('Database error');
    Order.count.mockRejectedValue(error);

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(loggerUtils.logCriticalError).toHaveBeenCalledWith(error, `💥 Error en hook de gamificación para Order ID ${order.order_id}`);
    expect(badgeService.assignBadgeById).not.toHaveBeenCalled();
  });

  it('debería asignar la insignia "Cliente Fiel" cuando el usuario completa 10 pedidos', async () => {
    const order = {
      order_id: 10,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14')
    };

    Order.count.mockImplementation((options) => {
      if (options.where.order_status === 'delivered' && options.where.user_id === order.user_id && !options.where.created_at) {
        return Promise.resolve(10); // Simula 10 pedidos completados
      }
      return Promise.resolve(0); // Evita Comprador Exprés
    });
    Order.findOne.mockResolvedValue({ Customizations: [] }); // Sin personalizaciones
    Order.findAll.mockImplementation((options) => {
      if (options.include && options.include[0].model === OrderDetail) {
        return Promise.resolve([]); // Simula pedidos únicos
      }
      if (options.include && options.include[0].model === OrderDetail && options.include[0].include) {
        return Promise.resolve([]); // Simula productos por categoría
      }
      return Promise.resolve([]);
    });
    Category.findByPk.mockResolvedValue({ name: 'Test Category' });
    const mockUserBadge = { user_id: 1, badge_id: 1, obtained_at: new Date('2025-10-14'), user_badge_id: 1 };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);
    notificationManager.notifyBadgeAssignment.mockResolvedValue();

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Order.count).toHaveBeenCalledWith({
      where: { user_id: order.user_id, order_status: 'delivered' },
      transaction: mockTransaction
    });
    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      order.user_id,
      1, // BADGE_IDS.CLIENTE_FIEL
      mockTransaction
    );
    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      order.user_id,
      1, // BADGE_IDS.CLIENTE_FIEL
      mockTransaction
    );
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining(`🏅 Insignias asignadas al usuario ${order.user_id}: CLIENTE_FIEL`)
    );
    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      order.user_id,
      'assign_badge',
      'Insignia 1 asignada'
    );
  });

  it('debería asignar la insignia "Primer Pedido Personalizado" cuando el usuario completa su primer pedido con personalización aprobada', async () => {
    const order = {
      order_id: 1,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14')
    };

    Order.count.mockImplementation((options) => {
      if (options.where.order_status === 'delivered' && options.where.user_id === order.user_id && !options.where.created_at) {
        return Promise.resolve(1); // Simula primer pedido completado
      }
      return Promise.resolve(0); // Evita Comprador Exprés
    });
    Order.findOne.mockResolvedValue({
      Customizations: [{ customization_id: 1, status: 'approved' }]
    });
    Order.findAll.mockImplementation((options) => {
      if (options.include && options.include[0].model === OrderDetail) {
        return Promise.resolve([]); // Simula pedidos únicos
      }
      if (options.include && options.include[0].model === OrderDetail && options.include[0].include) {
        return Promise.resolve([]); // Simula productos por categoría
      }
      return Promise.resolve([]);
    });
    Category.findByPk.mockResolvedValue({ name: 'Test Category' });
    const mockUserBadge = { user_id: 1, badge_id: 3, obtained_at: new Date('2025-10-14'), user_badge_id: 1 };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);
    notificationManager.notifyBadgeAssignment.mockResolvedValue();

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Order.count).toHaveBeenCalledWith({
      where: { user_id: order.user_id, order_status: 'delivered' },
      transaction: mockTransaction
    });
    expect(Order.findOne).toHaveBeenCalledWith({
      where: { order_id: order.order_id, order_status: 'delivered' },
      include: [{
        model: Customization,
        where: { status: 'approved' },
        required: false
      }],
      transaction: mockTransaction
    });
    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      order.user_id,
      3, // BADGE_IDS.PRIMER_PERSONALIZADO
      mockTransaction
    );
    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      order.user_id,
      3, // BADGE_IDS.PRIMER_PERSONALIZADO
      mockTransaction
    );
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining(`🏅 Insignias asignadas al usuario ${order.user_id}: PRIMER_PERSONALIZADO`)
    );
    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      order.user_id,
      'assign_badge',
      'Insignia 3 asignada'
    );
  });

  it('debería asignar la insignia "Coleccionista" cuando el usuario compra 3+ productos distintos en una categoría', async () => {
    const order = {
      order_id: 1,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14')
    };

    Order.count.mockImplementation((options) => {
      if (options.where.order_status === 'delivered' && options.where.user_id === order.user_id && !options.where.created_at) {
        return Promise.resolve(1); // Simula 1 pedido completado
      }
      return Promise.resolve(0); // Evita Comprador Exprés
    });
    Order.findOne.mockResolvedValue({ Customizations: [] });
    Order.findAll.mockImplementation((options) => {
      if (options.include && options.include[0].model === OrderDetail && options.include[0].include) {
        return Promise.resolve([
          { 'OrderDetails.ProductVariant.Product.category_id': 1, 'OrderDetails.ProductVariant.Product.product_id': 1 },
          { 'OrderDetails.ProductVariant.Product.category_id': 1, 'OrderDetails.ProductVariant.Product.product_id': 2 },
          { 'OrderDetails.ProductVariant.Product.category_id': 1, 'OrderDetails.ProductVariant.Product.product_id': 3 }
        ]);
      }
      return Promise.resolve([]);
    });
    Category.findByPk.mockResolvedValue({ name: 'Electronics' });
    const mockUserBadge = { user_id: 1, badge_id: 7, obtained_at: new Date('2025-10-14'), user_badge_id: 1 };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);
    notificationManager.notifyBadgeAssignment.mockResolvedValue();

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Order.findAll).toHaveBeenCalledWith({
      where: { user_id: order.user_id, order_status: 'delivered' },
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
      transaction: mockTransaction
    });
    expect(Category.findByPk).toHaveBeenCalledWith(1, { attributes: ['name'], transaction: mockTransaction });
    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      order.user_id,
      7, // BADGE_IDS.COLECCIONISTA
      mockTransaction,
      { category_id: 1 }
    );
    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      order.user_id,
      7, // BADGE_IDS.COLECCIONISTA
      mockTransaction,
      { categoryName: 'Electronics' }
    );
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining(`🏅 Insignias asignadas al usuario ${order.user_id}: COLECCIONISTA (Categoría: Electronics)`)
    );
    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      order.user_id,
      'assign_badge',
      'Insignia 7 asignada para categoría Electronics'
    );
  });

  it('debería asignar la insignia "Comprador Exprés" cuando el usuario completa dos pedidos entregados el mismo día', async () => {
    const order = {
      order_id: 2,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14T10:00:00.000Z')
    };

    Order.count.mockImplementation((options) => {
      if (options.where.order_status === 'delivered' && options.where.user_id === order.user_id && options.where.created_at) {
        return Promise.resolve(2); // Simula 2 pedidos entregados el mismo día
      }
      return Promise.resolve(1); // Simula 1 pedido completado en total
    });
    Order.findOne.mockResolvedValue({ Customizations: [] });
    Order.findAll.mockImplementation((options) => {
      if (options.include && options.include[0].model === OrderDetail) {
        return Promise.resolve([]); // Simula pedidos únicos
      }
      if (options.include && options.include[0].model === OrderDetail && options.include[0].include) {
        return Promise.resolve([]); // Simula productos por categoría
      }
      return Promise.resolve([]);
    });
    Category.findByPk.mockResolvedValue({ name: 'Test Category' });
    const mockUserBadge = { user_id: 1, badge_id: 6, obtained_at: new Date('2025-10-14'), user_badge_id: 1 };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);
    notificationManager.notifyBadgeAssignment.mockResolvedValue();

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Order.count).toHaveBeenCalledWith({
      where: {
        user_id: order.user_id,
        order_status: 'delivered',
        created_at: {
          [Op.between]: [
            expect.any(Date),
            expect.any(Date)
          ]
        }
      },
      transaction: mockTransaction
    });
    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      order.user_id,
      6, // BADGE_IDS.COMPRADOR_EXPRESS
      mockTransaction
    );
    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      order.user_id,
      6, // BADGE_IDS.COMPRADOR_EXPRESS
      mockTransaction
    );
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining(`🏅 Insignias asignadas al usuario ${order.user_id}: COMPRADOR_EXPRESS`)
    );
    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      order.user_id,
      'assign_badge',
      'Insignia 6 asignada'
    );
  });

  it('debería asignar la insignia "Cinco Pedidos Únicos" cuando el usuario completa 5 pedidos con variantes únicas', async () => {
    const order = {
      order_id: 5,
      user_id: 1,
      order_status: 'delivered',
      previous: jest.fn().mockReturnValue('shipped'),
      created_at: new Date('2025-10-14')
    };

    Order.count.mockImplementation((options) => {
      if (options.where.order_status === 'delivered' && options.where.user_id === order.user_id && !options.where.created_at) {
        return Promise.resolve(5); // Simula 5 pedidos completados
      }
      return Promise.resolve(0); // Evita Comprador Exprés
    });
    Order.findOne.mockResolvedValue({ Customizations: [] }); // Sin personalizaciones
    Order.findAll.mockResolvedValueOnce([
      { variant_id: 1 },
      { variant_id: 2 },
      { variant_id: 3 },
      { variant_id: 4 },
      { variant_id: 5 }
    ]); // for uniqueVariants
    Order.findAll.mockResolvedValueOnce([]); // for productsByCategory
    Category.findByPk.mockResolvedValue({ name: 'Test Category' });
    const mockUserBadge = { user_id: 1, badge_id: 5, obtained_at: new Date('2025-10-14'), user_badge_id: 1 };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);
    notificationManager.notifyBadgeAssignment.mockResolvedValue();

    await checkGamificationOnOrderDelivered(order, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Order.findAll).toHaveBeenCalledWith({
      where: { user_id: order.user_id, order_status: 'delivered' },
      attributes: [],
      include: [{
        model: OrderDetail,
        attributes: [[Sequelize.fn('DISTINCT', Sequelize.col('variant_id')), 'variant_id']],
        required: true
      }],
      raw: true,
      transaction: mockTransaction
    });
    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      order.user_id,
      5, // BADGE_IDS.CINCO_PEDIDOS
      mockTransaction
    );
    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      order.user_id,
      5, // BADGE_IDS.CINCO_PEDIDOS
      mockTransaction
    );
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining(`🏅 Insignias asignadas al usuario ${order.user_id}: CINCO_PEDIDOS`)
    );
    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      order.user_id,
      'assign_badge',
      'Insignia 5 asignada'
    );
  });

  it('debería asignar la insignia "Primer Reseñador" al crear la primera reseña', async () => {
    const review = {
      review_id: 1,
      user_id: 1,
      rating: 5,
      comment: '¡Excelente producto!'
    };

    // Simula que es la primera reseña del usuario
    Review.count.mockResolvedValue(1);

    // Simula que se asigna la insignia correctamente
    const mockUserBadge = {
      user_id: 1,
      badge_id: 8,
      obtained_at: new Date()
    };
    badgeService.assignBadgeById.mockResolvedValue(mockUserBadge);

    await checkGamificationOnReviewCreate(review, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Review.count).toHaveBeenCalledWith({
      where: { user_id: review.user_id },
      transaction: mockTransaction
    });

    expect(badgeService.assignBadgeById).toHaveBeenCalledWith(
      review.user_id,
      8, // BADGE_IDS.PRIMER_RESENA
      mockTransaction
    );

    expect(notificationManager.notifyBadgeAssignment).toHaveBeenCalledWith(
      review.user_id,
      8,
      mockTransaction
    );

    expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(
      review.user_id,
      'assign_badge',
      'Insignia 8 asignada'
    );

    // CORRECCIÓN 1.1: Ahora que el código de producción usa loggerUtils.logInfo, esta aserción funcionará.
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      expect.stringContaining('Primera reseña detectada para userId=1')
    );
  });

  it('NO debería asignar "Primer Reseñador" si el usuario ya tiene reseñas', async () => {
    const review = {
      review_id: 2,
      user_id: 1
    };

    Review.count.mockResolvedValue(3); // Ya tiene 3 reseñas

    await checkGamificationOnReviewCreate(review, { transaction: mockTransaction }, badgeService, notificationManager);

    expect(Review.count).toHaveBeenCalled();
    expect(badgeService.assignBadgeById).not.toHaveBeenCalled();
    expect(notificationManager.notifyBadgeAssignment).not.toHaveBeenCalled();
    // CORRECCIÓN 1.2: Agregar el emoji '🚫'
    expect(loggerUtils.logInfo).toHaveBeenCalledWith(
      '🚫 No es la primera reseña (total: 3) para userId=1'
    );
  });

  it('debería manejar errores al contar reseñas y registrarlos', async () => {
    const review = { review_id: 1, user_id: 1 };
    const error = new Error('DB connection failed');
    Review.count.mockRejectedValue(error);

    await checkGamificationOnReviewCreate(review, { transaction: mockTransaction }, badgeService, notificationManager);

    // CORRECCIÓN 1.3: Agregar el emoji '💥'
    expect(loggerUtils.logCriticalError).toHaveBeenCalledWith(
      error,
      '💥 Error en hook de gamificación para Review ID 1'
    );
    expect(badgeService.assignBadgeById).not.toHaveBeenCalled();
  });

  it('debería registrar el hook en Review al llamar setupGamificationHooks', () => {
    Review.addHook = jest.fn();
    setupGamificationHooks(badgeService, notificationManager);

    expect(Review.addHook).toHaveBeenCalledWith(
      'afterCreate',
      'checkGamificationReview',
      expect.any(Function)
    );
  });
});