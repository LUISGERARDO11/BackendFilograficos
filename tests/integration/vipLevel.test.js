const request = require('supertest');
const { app, sequelize } = require('../../sub-app-test');
const { User, Order, OrderDetail, ProductVariant, UserBadge } = require('../../src/models/Associations'); 
const { setupGamificationHooks, checkGamificationOnOrderDelivered } = require('../../src/hooks/gamificationInitializer');
const jwt = require('jsonwebtoken');

// Servicios necesarios para los mocks de instancia
const BadgeService = require('../../src/services/BadgeService');
const NotificationManager = require('../../src/services/notificationManager');

jest.setTimeout(10000);

describe('VIP Level Integration Tests', () => {
  let token, userId = 1;
  let badgeService, notificationManager;
  // Almacenamiento de datos simulado
  const userStore = new Map(); 

  // --- MOCK DE USER.UPDATE ROBUSTO ---
  // Función para asegurar que tanto la instancia superior como dataValues se actualicen
  const mockUserUpdate = (newValues, options) => {
    const user = userStore.get(options.where.user_id);
    if (user) {
      // 1. Actualizar dataValues (crucial para Sequelize y las comprobaciones internas)
      Object.assign(user.dataValues, newValues);
      // 2. Actualizar la instancia de nivel superior
      Object.assign(user, newValues);
      userStore.set(options.where.user_id, user);
    }
    return Promise.resolve([1]);
  };
  // ------------------------------------

  // --- HELPER CORREGIDO: Manejo de estado asíncrono y 'previous' ---
  const createMockInstance = (model, data, bs, nm) => {
      // Estado inicial. En Order.create, asumimos 'shipped' si no se especifica.
      let _previousStatus = data.order_status || 'shipped';

      const instance = {
          ...data,
          dataValues: data,
          
          update: jest.fn(async function(newValues) { // AHORA ES ASÍNCRONO
              const oldStatus = this.order_status; 
              const newStatus = newValues.order_status;
              
              // 1. Aplicar los nuevos valores a la instancia
              Object.assign(this.dataValues, newValues);
              Object.assign(this, newValues);

              // 2. Disparar hook si el estado cambia A 'delivered'
              if (model === Order && newStatus === 'delivered' && oldStatus !== 'delivered') { 
                  // AWAIT EL HOOK: Esperar a que la lógica de gamificación termine
                  await checkGamificationOnOrderDelivered(this, { transaction: {} }, bs, nm); 
              }
              
              // 3. Actualizar el estado anterior DESPUÉS del update
              _previousStatus = oldStatus;

              return Promise.resolve(this);
          }),

          previous: jest.fn((key) => {
              if (model === Order && key === 'order_status') {
                  // Devolver el estado antes de la última actualización (que debería ser 'shipped' la primera vez)
                  return _previousStatus;
              }
              return undefined;
          }),
          get: jest.fn(function () { return this.dataValues || this; }),
      };
      return instance;
  };
  // -------------------------------------------------------------

  beforeAll(async () => {
    // Inicialización de instancias de servicio
    badgeService = new BadgeService();
    notificationManager = new NotificationManager();

    // Registrar hooks
    setupGamificationHooks(badgeService, notificationManager);

    // --- Sobreescribir mocks para simular DB (Integración) ---
    // User: CRUD simple en store
    User.findByPk.mockImplementation((id) => Promise.resolve(userStore.get(id) || null));
    User.create.mockImplementation((data) => {
        const instance = createMockInstance(User, data, badgeService, notificationManager);
        userStore.set(data.user_id, instance);
        return Promise.resolve(instance);
    });
    // USAR MOCK ROBUSTO
    User.update.mockImplementation(mockUserUpdate);
    User.destroy.mockImplementation(() => { userStore.clear(); return Promise.resolve(1); });

    // Order: Usará el helper de createMockInstance, iniciando en 'shipped'
    Order.create.mockImplementation((data) => Promise.resolve(createMockInstance(Order, { order_status: 'shipped', ...data }, badgeService, notificationManager)));
    
    // UserBadge: Usará el mock de bulkCreate
    UserBadge.bulkCreate.mockImplementation((data) => Promise.resolve(data.map(d => createMockInstance(UserBadge, d, badgeService, notificationManager))));
    
    // Configuración inicial del usuario
    await User.create({ user_id: userId, email: 'vip@test.com', name: 'VIP User', vip_level: null });

    // Token
    token = jwt.sign({ user_id: userId, user_type: 'cliente' }, process.env.JWT_SECRET || 'test_secret');
  });

  afterEach(async () => {
    // Limpieza de mocks y restauración de implementaciones
    jest.clearAllMocks();
    
    // Restaurar mocks esenciales con la implementación COMPLETA
    User.findByPk.mockImplementation((id) => Promise.resolve(userStore.get(id) || null));
    User.update.mockImplementation(mockUserUpdate); // <-- USAR IMPLEMENTACIÓN ROBUSTA
    Order.create.mockImplementation((data) => Promise.resolve(createMockInstance(Order, { order_status: 'shipped', ...data }, badgeService, notificationManager)));
    
    // Limpieza de estados en el store simulado
    await User.update({ vip_level: null }, { where: { user_id: userId } });
    
    // Mocks de conteo (reset a 0 si no se sobrescribe)
    Order.count.mockResolvedValue(0); 
    UserBadge.count.mockResolvedValue(0);
    Order.findAll.mockResolvedValue([]); // Para uniqueOrdersCount/Coleccionista
  });

  afterAll(async () => {
    await sequelize.close();
  });

  // PLATA: 7 pedidos entregados
  it('debe asignar VIP Plata con 7 pedidos entregados', async () => {
    // Sobrescribimos Order.count para que simule los 7 pedidos completados
    Order.count.mockResolvedValue(7);
    Order.findAll.mockResolvedValue([]); // uniqueOrdersCount = 0

    for (let i = 1; i <= 7; i++) {
      const order = await Order.create({
        order_id: 100 + i,
        user_id: userId,
        created_at: new Date(),
      });
      // Cada update dispara el hook y recalcula el nivel VIP
      await order.update({ order_status: 'delivered' }); 
    }

    const user = await User.findByPk(userId);
    expect(user.vip_level).toBe('Plata');
  });

  // PLATA: 5 variantes únicas
  it('debe asignar VIP Plata con 5 variantes únicas', async () => {
    // 1. Mocks para simular el estado necesario:
    // - Hay 1 pedido entregado en total (el que se está procesando).
    Order.count.mockResolvedValue(1); 
    UserBadge.count.mockResolvedValue(0); // 0 insignias

    // - Order.findAll se llama múltiples veces. Encadenamos los mocks:
    Order.findAll
      // Call 1 (Line 69): Para uniqueVariants (Sets uniqueOrdersCount = 5)
      .mockImplementationOnce(() => Promise.resolve(Array(5).fill({
        // Simular la estructura mínima necesaria para el conteo de variantes únicas
        'OrderDetails.ProductVariant.Product.category_id': 1, 
        'OrderDetails.ProductVariant.Product.product_id': 1 
      }))) 
      // Call 2 (Line 89): Para productsByCategory (Sets eligibleCategories = [])
      .mockImplementationOnce(() => Promise.resolve([])); 

    // 2. Disparar hook
    const order = await Order.create({ 
      order_id: 999,
      user_id: userId,
      created_at: new Date()
    });
    await order.update({ order_status: 'delivered' });
    
    // 3. Verificación
    const user = await User.findByPk(userId);
    // El nivel VIP debe ser 'Plata' porque uniqueOrdersCount=5 >= 5 es true.
    expect(user.vip_level).toBe('Plata');
  });

  // ORO: 3 insignias (sin pedidos suficientes)
  it('debe asignar VIP Oro con 3 insignias', async () => {
    // 1. Mocks para simular el estado necesario:
    await User.update({ vip_level: null }, { where: { user_id: userId } });
    
    // Solo 1 pedido (el que dispara el hook). No cumple los 7 para Plata.
    Order.count.mockResolvedValue(1); 
    
    // *** CLAVE DE LA CORRECCIÓN ***: Aseguramos que UserBadge.count devuelva 3.
    // Esto fuerza la condición 'badges >= 3' en el cálculo VIP.
    UserBadge.count.mockResolvedValue(3); 
    
    Order.findAll.mockResolvedValue([]); 

    // Opcional: Simular las insignias en el mock store (no afecta a UserBadge.count que está mockeado)
    await UserBadge.bulkCreate([
      { user_id: userId, badge_id: 1, category_id: null },
      { user_id: userId, badge_id: 5, category_id: null },
      { user_id: userId, badge_id: 7, category_id: 1 },
    ]);

    // 2. Disparar hook (1 pedido para forzar la ejecución del chequeo VIP)
    const order = await Order.create({ 
        order_id: 301,
        user_id: userId,
        created_at: new Date()
    });
    await order.update({ order_status: 'delivered' }); 

    // 3. Verificación
    const user = await User.findByPk(userId);
    // Debe ser 'Oro' porque la condición 'badges >= 3' es verdadera.
    expect(user.vip_level).toBe('Oro'); 
  });
  
  // ORO: 10 pedidos entregados
  it('debe asignar VIP Oro con 10 pedidos entregados', async () => {
    Order.count.mockResolvedValue(10);
    Order.findAll.mockResolvedValue([]); // uniqueOrdersCount = 0

    for (let i = 1; i <= 10; i++) {
      const order = await Order.create({
        order_id: 200 + i,
        user_id: userId,
        created_at: new Date(),
      });
      await order.update({ order_status: 'delivered' });
    }

    const user = await User.findByPk(userId);
    expect(user.vip_level).toBe('Oro');
  });


  // NO cambia si ya tiene nivel (YA PASA)
  it('no debe bajar de Oro a Plata', async () => {
    await User.update({ vip_level: 'Oro' }, { where: { user_id: userId } });
    
    Order.count.mockResolvedValue(1); 
    UserBadge.count.mockResolvedValue(0);
    Order.findAll.mockResolvedValue([]); // Aseguramos que no hay variantes unicas ni categorias

    // Disparar hook
    const order = await Order.create({ user_id: userId, created_at: new Date() });
    await order.update({ order_status: 'delivered' }); 

    const user = await User.findByPk(userId);
    expect(user.vip_level).toBe('Oro'); 
  });

  // Se ve en /profile (YA PASA)
  it('debe mostrar vip_level en /api/users/profile', async () => {
    await User.update({ vip_level: 'Oro' }, { where: { user_id: userId } });

    const res = await request(app)
      .get('/api/users/profile')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200); 
    expect(res.body.vip_level).toBe('Oro');
  });
});