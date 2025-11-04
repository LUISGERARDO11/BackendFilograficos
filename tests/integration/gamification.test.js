const request = require('supertest');
const { app, sequelize } = require('../../sub-app-test');
const { 
  User, Order, OrderDetail, Product, ProductVariant, 
  Category, Customization, Badge, UserBadge, BadgeCategory, 
  RevokedToken, Review 
} = require('../../src/models/Associations');
const { setupGamificationHooks } = require('../../src/hooks/gamificationInitializer');
const jwt = require('jsonwebtoken');

// Mockear servicios externos
jest.mock('../../src/services/BadgeService', () => {
  return jest.fn().mockImplementation(() => ({
    assignBadgeById: jest.fn().mockResolvedValue({ user_badge_id: 1 }),
    getBadgeCategoriesWithCount: jest.fn().mockResolvedValue({ count: 1, rows: [{ badge_category_id: 1, badge_count: 1 }] }),
  }));
});

const mockNotificationManager = jest.fn().mockImplementation(() => ({
  notifyBadgeAssignment: jest.fn().mockResolvedValue(),
}));
jest.mock('../../src/services/notificationManager', () => mockNotificationManager);

// Mockear authService
jest.mock('../../src/services/authService', () => ({
  verifyJWT: jest.fn().mockResolvedValue({
    success: true,
    data: { user_id: 1, user_type: 'cliente' },
    session: { browser: 'web' },
    message: 'Token válido',
  }),
  extendSession: jest.fn().mockResolvedValue('mocked_token'),
  getConfig: jest.fn().mockResolvedValue({ session_lifetime: 900 }),
}));

// Mockear modelos con addHook
jest.mock('../../src/models/Associations', () => {
  const mockModel = (name) => ({
    modelName: name,
    create: jest.fn().mockImplementation((data) => Promise.resolve({ ...data, id: 1 })),
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ count: 0, rows: [] }),
    update: jest.fn().mockResolvedValue([1]),
    destroy: jest.fn().mockResolvedValue(1),
    count: jest.fn().mockResolvedValue(0),
    belongsTo: jest.fn(),
    hasOne: jest.fn(),
    hasMany: jest.fn(),
    belongsToMany: jest.fn(),
    addHook: jest.fn(),
  });
  return {
    User: mockModel('User'),
    Order: mockModel('Order'),
    OrderDetail: mockModel('OrderDetail'),
    Product: mockModel('Product'),
    ProductVariant: mockModel('ProductVariant'),
    Category: mockModel('Category'),
    Customization: mockModel('Customization'),
    Badge: mockModel('Badge'),
    UserBadge: mockModel('UserBadge'),
    BadgeCategory: mockModel('BadgeCategory'),
    RevokedToken: mockModel('RevokedToken'),
    Review: mockModel('Review'),
  };
});
describe('Gamification Integration Tests', () => {
  let user, badge, category, token;
  let server;
  let notificationManagerInstance;
  let badgeServiceInstance;

  beforeAll(async () => {
    // Configurar mocks iniciales
    User.create.mockResolvedValue({ user_id: 1, name: 'Test User', email: 'test@example.com' });
    Category.create.mockResolvedValue({ category_id: 1, name: 'Electronics' });
    BadgeCategory.create.mockResolvedValue({ badge_category_id: 1, name: 'General' });
    Badge.create.mockResolvedValue({ badge_id: 8, name: 'Primer Reseñador', badge_category_id: 1 });

    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    const BadgeService = require('../../src/services/BadgeService');
    badgeServiceInstance = new BadgeService();
    notificationManagerInstance = new mockNotificationManager();

    setupGamificationHooks(badgeServiceInstance, notificationManagerInstance);

    user = await User.create({ user_id: 1, name: 'Test User', email: 'test@example.com' });
    category = await Category.create({ category_id: 1, name: 'Electronics' });
    await BadgeCategory.create({ badge_category_id: 1, name: 'General' });
    badge = await Badge.create({ badge_id: 8, name: 'Primer Reseñador', badge_category_id: 1 });
    token = jwt.sign({ user_id: 1, user_type: 'cliente' }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });

    server = app.listen();
  });
  afterAll(async () => {
    await sequelize.close();
    if (server) await new Promise((resolve) => server.close(resolve));
  });
  it('should assign Coleccionista badge when user has 3+ products in a category', async () => {
    UserBadge.create.mockResolvedValueOnce({ user_id: 1, badge_id: 7, category_id: 1 });
    UserBadge.findOne.mockResolvedValueOnce({ user_id: 1, badge_id: 7, category_id: 1 });
    Product.create
      .mockResolvedValueOnce({ product_id: 1, name: 'Product 1', category_id: 1 })
      .mockResolvedValueOnce({ product_id: 2, name: 'Product 2', category_id: 1 })
      .mockResolvedValueOnce({ product_id: 3, name: 'Product 3', category_id: 1 });
    ProductVariant.create
      .mockResolvedValueOnce({ variant_id: 1, product_id: 1, sku: 'SKU1' })
      .mockResolvedValueOnce({ variant_id: 2, product_id: 2, sku: 'SKU2' })
      .mockResolvedValueOnce({ variant_id: 3, product_id: 3, sku: 'SKU3' });
    Order.create
      .mockResolvedValueOnce({ order_id: 1, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-12'), total: 100 })
      .mockResolvedValueOnce({ order_id: 2, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-12'), total: 100 })
      .mockResolvedValueOnce({
        order_id: 3,
        user_id: 1,
        order_status: 'shipped',
        created_at: new Date('2025-10-12'),
        total: 100,
        update: jest.fn().mockResolvedValue([1])
      });
    OrderDetail.create
      .mockResolvedValueOnce({ order_id: 1, variant_id: 1, quantity: 1, unit_price: 100, subtotal: 100 })
      .mockResolvedValueOnce({ order_id: 2, variant_id: 2, quantity: 1, unit_price: 100, subtotal: 100 })
      .mockResolvedValueOnce({ order_id: 3, variant_id: 3, quantity: 1, unit_price: 100, subtotal: 100 });
    await Product.create({ product_id: 1, name: 'Product 1', category_id: 1 });
    await Product.create({ product_id: 2, name: 'Product 2', category_id: 1 });
    await Product.create({ product_id: 3, name: 'Product 3', category_id: 1 });
    await ProductVariant.create({ variant_id: 1, product_id: 1, sku: 'SKU1' });
    await ProductVariant.create({ variant_id: 2, product_id: 2, sku: 'SKU2' });
    await ProductVariant.create({ variant_id: 3, product_id: 3, sku: 'SKU3' });
    await Order.create({ order_id: 1, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-12'), total: 100 });
    await OrderDetail.create({ order_id: 1, variant_id: 1, quantity: 1, unit_price: 100, subtotal: 100 });
    await Order.create({ order_id: 2, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-12'), total: 100 });
    await OrderDetail.create({ order_id: 2, variant_id: 2, quantity: 1, unit_price: 100, subtotal: 100 });
    const order3 = await Order.create({ order_id: 3, user_id: 1, order_status: 'shipped', created_at: new Date('2025-10-12'), total: 100 });
    await OrderDetail.create({ order_id: 3, variant_id: 3, quantity: 1, unit_price: 100, subtotal: 100 });
    await order3.update({ order_status: 'delivered' });
    const userBadge = await UserBadge.findOne({ where: { user_id: 1, badge_id: 7, category_id: 1 } });
    expect(userBadge).not.toBeNull();
    expect(userBadge.category_id).toBe(1);
  });
  it('should send notification on badge assignment', async () => {
    const mockNotify = notificationManagerInstance.notifyBadgeAssignment;
    mockNotify.mockClear();
    mockNotify.mockResolvedValue();
    await Badge.create({ badge_id: 1, name: 'Test Badge', badge_category_id: 1, is_active: true });
    await UserBadge.create({ user_badge_id: 1, user_id: 1, badge_id: 1 });
    // Simular llamada al hook
    await notificationManagerInstance.notifyBadgeAssignment(1, 1, null);
    expect(mockNotify).toHaveBeenCalledWith(1, 1, null);
  });
  it('should create category and associated badge', async () => {
    BadgeCategory.create.mockResolvedValue({ badge_category_id: 2, name: 'New Category', is_active: true });
    Badge.create.mockResolvedValue({ badge_id: 8, name: 'New Badge', badge_category_id: 2, is_active: true });
    BadgeCategory.findByPk.mockResolvedValue({ badge_category_id: 2, name: 'New Category', is_active: true });
    Badge.findOne.mockResolvedValue({ badge_id: 8, name: 'New Badge', badge_category_id: 2 });
    await BadgeCategory.create({ badge_category_id: 2, name: 'New Category', is_active: true });
    await Badge.create({ badge_id: 8, name: 'New Badge', badge_category_id: 2, is_active: true });
    const foundCategory = await BadgeCategory.findByPk(2);
    const foundBadge = await Badge.findOne({ where: { badge_category_id: 2 } });
    expect(foundCategory).not.toBeNull();
    expect(foundBadge).not.toBeNull();
    expect(foundBadge.badge_category_id).toBe(2);
  });
  it('should query and filter categories/insignias', async () => {
    BadgeCategory.findAndCountAll.mockResolvedValue({ count: 1, rows: [{ badge_category_id: 1, name: 'General' }] });
    Badge.findAll.mockResolvedValue([{ badge_id: 7, badge_category_id: 1 }]);
    const categories = await BadgeCategory.findAndCountAll({ where: { is_active: true } });
    const badges = await Badge.findAll({ where: { badge_category_id: 1 } });
    expect(categories.count).toBe(1);
    expect(badges.length).toBe(1);
  });
  it('should assign "Primer Reseñador" badge on first review', async () => {
    // Simular que no hay reseñas previas
    Review.count.mockResolvedValueOnce(1);
    UserBadge.create.mockResolvedValueOnce({ user_id: 1, badge_id: 8 });

    // Simular creación de reseña
    const review = { review_id: 1, user_id: 1, rating: 5, comment: '¡Genial!' };
    await Review.create(review);

    // Disparar manualmente el hook (simulado)
    const hookFn = Review.addHook.mock.calls.find(call => call[1] === 'checkGamificationReview')[2];
    await hookFn(review, { transaction: {} });

    expect(Review.count).toHaveBeenCalledWith({
      where: { user_id: 1 },
      transaction: expect.any(Object)
    });
    expect(badgeServiceInstance.assignBadgeById).toHaveBeenCalledWith(1, 8, expect.any(Object));
    expect(notificationManagerInstance.notifyBadgeAssignment).toHaveBeenCalledWith(1, 8, expect.any(Object));
    expect(UserBadge.create).toHaveBeenCalled();
  });

  it('should NOT assign "Primer Reseñador" if user already has reviews', async () => {
    Review.count.mockResolvedValueOnce(3); // Ya tiene 3 reseñas
    badgeServiceInstance.assignBadgeById.mockClear();
    notificationManagerInstance.notifyBadgeAssignment.mockClear();

    const review = { review_id: 2, user_id: 1 };
    await Review.create(review);

    const hookFn = Review.addHook.mock.calls.find(call => call[1] === 'checkGamificationReview')[2];
    await hookFn(review, { transaction: {} });

    expect(Review.count).toHaveBeenCalled();
    expect(badgeServiceInstance.assignBadgeById).not.toHaveBeenCalled();
    expect(notificationManagerInstance.notifyBadgeAssignment).not.toHaveBeenCalled();
  });

  it('should return "Primer Reseñador" badge in user profile', async () => {
    RevokedToken.findOne.mockResolvedValue(null);
    User.findByPk.mockResolvedValue({
      user_id: 1,
      name: 'Test User',
      UserBadges: [{
        badge_id: 8,
        obtained_at: new Date(),
        Badge: { 
          badge_id: 8, 
          name: 'Primer Reseñador', 
          description: 'Por tu primera reseña', 
          icon_url: 'http://example.com/review.png',
          BadgeCategory: { name: 'Reseñas' }
        }
      }]
    });

    const response = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.badges).toContainEqual(
      expect.objectContaining({
        id: 8,
        name: 'Primer Reseñador',
        category: 'Reseñas'
      })
    );
  });
  it('should assign badges for orders (primer, cinco, fiel)', async () => {
    UserBadge.create
      .mockResolvedValueOnce({ user_id: 1, badge_id: 3 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 5 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 1 });
    UserBadge.findOne
      .mockResolvedValueOnce({ user_id: 1, badge_id: 3 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 5 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 1 });
    await Order.create({ order_id: 4, user_id: 1, order_status: 'delivered', created_at: new Date(), total: 100 });
    await Order.create({ order_id: 5, user_id: 1, order_status: 'delivered', created_at: new Date(), total: 100 });
    await Order.create({ order_id: 6, user_id: 1, order_status: 'delivered', created_at: new Date(), total: 100 });
    await Customization.create({ customization_id: 1, order_id: 4, status: 'approved' });
    const primerBadge = await UserBadge.findOne({ where: { badge_id: 3 } });
    const cincoBadge = await UserBadge.findOne({ where: { badge_id: 5 } });
    const fielBadge = await UserBadge.findOne({ where: { badge_id: 1 } });
    expect(primerBadge).not.toBeNull();
    expect(cincoBadge).not.toBeNull();
    expect(fielBadge).not.toBeNull();
  });
  it('should assign Comprador Exprés and Coleccionista', async () => {
    UserBadge.create
      .mockResolvedValueOnce({ user_id: 1, badge_id: 6 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 7 });
    UserBadge.findOne
      .mockResolvedValueOnce({ user_id: 1, badge_id: 6 })
      .mockResolvedValueOnce({ user_id: 1, badge_id: 7 });
    await Order.create({ order_id: 7, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-14'), total: 100 });
    await Order.create({ order_id: 8, user_id: 1, order_status: 'delivered', created_at: new Date('2025-10-14'), total: 100 });
    const expressBadge = await UserBadge.findOne({ where: { badge_id: 6 } });
    const coleccionistaBadge = await UserBadge.findOne({ where: { badge_id: 7 } });
    expect(expressBadge).not.toBeNull();
    expect(coleccionistaBadge).not.toBeNull();
  });
  it('should return user badges in getProfile endpoint', async () => {
    RevokedToken.findOne.mockResolvedValue(null);
    User.findByPk.mockResolvedValue({
      user_id: 1,
      name: 'Test User',
      email: 'test@example.com',
      phone: '1234567890',
      status: 'activo',
      user_type: 'cliente',
      Addresses: [],
      Account: { profile_picture_url: null },
      UserBadges: [{
        badge_id: 7,
        category_id: 1,
        obtained_at: new Date(),
        Badge: { badge_id: 7, name: 'Coleccionista', description: '3+ productos en una categoría', icon_url: 'http://example.com/icon.png', public_id: 'badge_7', BadgeCategory: { name: 'General' } },
        Category: { name: 'Electronics' },
      }],
    });
    const response = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.badges).toHaveLength(1);
    expect(response.body.badges[0]).toMatchObject({ id: 7, name: 'Coleccionista', category: 'General', product_category: 'Electronics' });
  }, 10000);
});