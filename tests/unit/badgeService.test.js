const BadgeService = require('../../src/services/BadgeService');
const { Badge, UserBadge, BadgeCategory, Category, User, Order, OrderDetail, ProductVariant, Product, Customization } = require('../../src/models/Associations');
const { Op } = require('sequelize');
const loggerUtils = require('../../src/utils/loggerUtils');
const cloudinaryService = require('../../src/services/cloudinaryService');

jest.mock('../../src/models/Associations');
jest.mock('../../src/utils/loggerUtils');
jest.mock('../../src/services/cloudinaryService');

describe('BadgeService - Unit Tests', () => {
  let badgeService;
  let mockTransaction;

  beforeEach(() => {
    badgeService = new BadgeService({
      BadgeCategory,
      Badge,
      UserBadge,
      Category,
      uploadBadgeIconToCloudinary: cloudinaryService.uploadBadgeIconToCloudinary,
      deleteFromCloudinary: cloudinaryService.deleteFromCloudinary
    });
    mockTransaction = {};
    jest.clearAllMocks();
  });

  describe('Get Badges', () => {
    it('should get badges with pagination', async () => {
      const mockResult = { count: 1, rows: [{ badge_id: 1 }] };
      Badge.findAndCountAll.mockResolvedValue(mockResult);
      const result = await badgeService.getBadges({}, mockTransaction);
      expect(result).toEqual(mockResult);
      expect(Badge.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({ transaction: mockTransaction }));
    });
  });

  describe('Get Active Badges', () => {
    it('should get active badges', async () => {
      const mockBadges = [{ badge_id: 1, name: 'Active' }];
      Badge.findAll.mockResolvedValue(mockBadges);
      const result = await badgeService.getActiveBadges(mockTransaction);
      expect(result).toEqual(mockBadges);
      expect(Badge.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { is_active: true } }));
    });
  });

  describe('Get Badge By Id', () => {
    it('should get badge by id', async () => {
      const mockBadge = { badge_id: 1, is_active: true };
      Badge.findByPk.mockResolvedValue(mockBadge);
      const result = await badgeService.getBadgeById(1, mockTransaction);
      expect(result).toEqual(mockBadge);
      expect(Badge.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
    });

    it('should return null for inactive badge', async () => {
      Badge.findByPk.mockResolvedValue({ badge_id: 1, is_active: false });
      const result = await badgeService.getBadgeById(1, mockTransaction);
      expect(result).toBeNull();
    });
  });

  describe('Create Badge', () => {
    it('should create a badge', async () => {
      const data = { name: 'Test Badge', badge_category_id: 1 };
      const fileBuffer = Buffer.from('file');
      BadgeCategory.findByPk.mockResolvedValue({ is_active: true });
      Badge.findOne.mockResolvedValue(null);
      cloudinaryService.uploadBadgeIconToCloudinary.mockResolvedValue({ secure_url: 'url', public_id: 'id' });
      Badge.create.mockResolvedValue({ badge_id: 1, ...data, icon_url: 'url', public_id: 'id' });
      const result = await badgeService.createBadge(data, fileBuffer, mockTransaction);
      expect(result).toBeDefined();
      expect(cloudinaryService.uploadBadgeIconToCloudinary).toHaveBeenCalled();
      expect(Badge.create).toHaveBeenCalled();
    });

    it('should throw error for existing badge name', async () => {
      const data = { name: 'Test Badge', badge_category_id: 1 };
      Badge.findOne.mockResolvedValue({ name: 'Test Badge' });
      await expect(badgeService.createBadge(data, Buffer.from('file'), mockTransaction)).rejects.toThrow('El nombre de la insignia ya está en uso');
    });
  });

  describe('Update Badge', () => {
    it('should update badge', async () => {
      const data = { name: 'Updated' };
      const fileBuffer = Buffer.from('newfile');
      const mockBadge = { badge_id: 1, is_active: true, public_id: 'old_id', update: jest.fn().mockResolvedValue([1]) };
      Badge.findByPk.mockResolvedValue(mockBadge);
      Badge.findOne.mockResolvedValue(null);
      cloudinaryService.uploadBadgeIconToCloudinary.mockResolvedValue({ secure_url: 'new_url', public_id: 'new_id' });
      cloudinaryService.deleteFromCloudinary.mockResolvedValue();
      await badgeService.updateBadge(1, data, fileBuffer, mockTransaction);
      expect(cloudinaryService.deleteFromCloudinary).toHaveBeenCalledWith('old_id');
      expect(mockBadge.update).toHaveBeenCalled();
    });

    it('should throw error for inactive badge', async () => {
      Badge.findByPk.mockResolvedValue({ badge_id: 1, is_active: false });
      await expect(badgeService.updateBadge(1, {}, null, mockTransaction)).rejects.toThrow('No se puede actualizar una insignia inactiva');
    });
  });

  describe('Delete Badge', () => {
    it('should deactivate badge', async () => {
      const mockBadge = { badge_id: 1, name: 'Test', update: jest.fn().mockResolvedValue([1]) };
      Badge.findByPk.mockResolvedValue(mockBadge);
      const result = await badgeService.deleteBadge(1, mockTransaction);
      expect(result).toEqual({ message: `Insignia 'Test' desactivada exitosamente` });
      expect(mockBadge.update).toHaveBeenCalledWith({ is_active: false }, expect.any(Object));
    });
  });

  describe('Get Badge Categories With Count', () => {
    it('should get categories with badge count', async () => {
      const mockResult = { count: [{ badge_category_id: 1 }], rows: [{ badge_category_id: 1, badge_count: 5 }] };
      BadgeCategory.findAndCountAll.mockResolvedValue(mockResult);
      const result = await badgeService.getBadgeCategoriesWithCount({}, mockTransaction);
      expect(result).toEqual({ count: mockResult.count.length, rows: mockResult.rows });
      expect(BadgeCategory.findAndCountAll).toHaveBeenCalled();
    });
  });

  describe('Get Granted Badges History', () => {
    it('should get granted badges history', async () => {
      const mockBadges = [{
        user_badge_id: 1,
        user_id: 1,
        badge_id: 1,
        obtained_at: new Date(),
        User: { user_id: 1, email: 'test@example.com', name: 'Test User' },
        Badge: { badge_id: 1, name: 'Test Badge', icon_url: 'url', BadgeCategory: { name: 'Test Category' } },
        Category: null
      }];
      UserBadge.findAll.mockResolvedValue(mockBadges);
      const mockUsers = [{
        user_id: 1,
        total_badges: '1',
        last_obtained_at: new Date(),
        getDataValue: jest.fn((key) => ({
          total_badges: '1',
          last_obtained_at: new Date()
        })[key])
      }];
      User.findAndCountAll.mockResolvedValue({ count: 1, rows: mockUsers });
      const result = await badgeService.getGrantedBadgesHistory({}, mockTransaction);
      expect(result).toBeDefined();
      expect(result.totalUsers).toBe(1);
      expect(result.groupedHistory).toHaveLength(1);
      expect(User.findAndCountAll).toHaveBeenCalled();
      expect(mockUsers[0].getDataValue).toHaveBeenCalledWith('total_badges');
      expect(mockUsers[0].getDataValue).toHaveBeenCalledWith('last_obtained_at');
    });
  });

  describe('Get Badge Metrics', () => {
    it('should get badge metrics', async () => {
      UserBadge.count.mockResolvedValueOnce(10).mockResolvedValueOnce(5);
      UserBadge.findAll.mockResolvedValue([{
        badge_id: 1,
        count: '3',
        'Badge.name': 'Test Badge',
        'Badge.icon_url': 'url',
        'Badge.BadgeCategory.name': 'Test Category'
      }]);
      const result = await badgeService.getBadgeMetrics(mockTransaction);
      expect(result).toBeDefined();
      expect(UserBadge.count).toHaveBeenCalledTimes(2);
    });
  });

  describe('Get Acquisition Trend', () => {
    it('should get acquisition trend', async () => {
      UserBadge.findAll.mockResolvedValue([{ date: '2025-10-12', count: '1' }]);
      const result = await badgeService.getAcquisitionTrend(30, mockTransaction);
      expect(result).toBeDefined();
      expect(result.length).toBe(31);
    });
  });

  describe('Assign Badge By Id', () => {
    it('should assign badge', async () => {
      Badge.findOne.mockResolvedValue({ badge_id: 1, is_active: true });
      UserBadge.findOrCreate.mockResolvedValue([{ user_badge_id: 1 }, true]);
      const result = await badgeService.assignBadgeById(1, 1, mockTransaction);
      expect(result).toBeDefined();
      expect(UserBadge.findOrCreate).toHaveBeenCalled();
    });
  });
});