const request = require('supertest');
const { app } = require('../../sub-app-test');

// Mock específico para este archivo
jest.mock('../../src/models/Models3d', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findByPk: jest.fn(),
  findAll: jest.fn(),
  update: jest.fn(),
  destroy: jest.fn(),
}));

const Models3d = require('../../src/models/Models3d');

describe('Models3d Integration Tests', () => {
  const adminToken = 'Bearer mocked_token';

  beforeEach(() => {
    // Resetear módulos y mocks para evitar conflictos
    jest.resetModules();
    jest.clearAllMocks();
    // Volver a importar el app después de resetear módulos
    jest.doMock('../../sub-app-test', () => require('../../sub-app-test'));
  });

  describe('POST /api/models3d', () => {
    it('crea modelo con auth admin, verifica unicidad', async () => {
      const modelData = { 
        product_name: 'Modelo Test', 
        description: 'Descripción Test',
        model_url: 'http://test.com/model.glb',
        preview_image_url: 'http://test.com/preview.jpg'
      };

      Models3d.findOne.mockResolvedValueOnce(null);
      Models3d.create.mockResolvedValueOnce({ id: 1, ...modelData });

      const response = await request(app)
        .post('/api/models3d')
        .set('Authorization', adminToken)
        .set('X-CSRF-Token', 'mock-csrf-token')
        .send(modelData);

      console.log('POST /api/models3d response:', response.body); // Para depuración
      expect(response.status).toBe(201);
      expect(response.body.model).toMatchObject(modelData);
      expect(Models3d.create).toHaveBeenCalledWith(modelData);
      expect(Models3d.findOne).toHaveBeenCalledWith({ 
        where: { product_name: modelData.product_name } 
      });
    });

    it('rechaza creación duplicada', async () => {
      Models3d.findOne.mockResolvedValueOnce({ id: 1 });

      const response = await request(app)
        .post('/api/models3d')
        .set('Authorization', adminToken)
        .set('X-CSRF-Token', 'mock-csrf-token')
        .send({ 
          product_name: 'Duplicado', 
          description: 'Descripción', 
          model_url: 'http://test.com/model.glb',
          preview_image_url: 'http://test.com/preview.jpg'
        });

      console.log('POST /api/models3d duplicado response:', response.body); // Para depuración
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('El nombre de este producto 3D ya existe.');
    });
  });

  describe('GET /api/models3d', () => {
    it('retorna lista ordenada sin auth', async () => {
      const mockModels = [
        { id: 2, product_name: 'B', createdAt: new Date('2025-01-01'), model_url: 'http://test.com/modelB.glb' },
        { id: 1, product_name: 'A', createdAt: new Date('2024-12-01'), model_url: 'http://test.com/modelA.glb' }
      ];
      Models3d.findAll.mockResolvedValueOnce(mockModels);

      const response = await request(app).get('/api/models3d');

      console.log('GET /api/models3d response:', response.body); // Para depuración
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(Models3d.findAll).toHaveBeenCalledWith({
        attributes: ['id', 'product_name', 'description', 'model_url', 'preview_image_url'],
        order: [['product_name', 'ASC']]
      });
    });
  });

  describe('GET /api/models3d/:id', () => {
    it('obtiene por ID', async () => {
      Models3d.findByPk.mockResolvedValueOnce({ 
        id: 1, 
        product_name: 'Test',
        model_url: 'http://test.com/model.glb'
      });

      const response = await request(app).get('/api/models3d/1');
      console.log('GET /api/models3d/:id response:', response.body); // Para depuración
      expect(response.status).toBe(200);
      expect(response.body.model.id).toBe(1);
    });

    it('maneja 404', async () => {
      Models3d.findByPk.mockResolvedValueOnce(null);
      const response = await request(app).get('/api/models3d/999');
      console.log('GET /api/models3d/:id 404 response:', response.body); // Para depuración
      expect(response.status).toBe(404);
    });
  });

  describe('PUT /api/models3d/:id', () => {
    it('actualiza con auth admin, verifica DB', async () => {
      Models3d.findByPk.mockResolvedValueOnce({ id: 1 });
      Models3d.update.mockResolvedValueOnce([1]);
      Models3d.findByPk.mockResolvedValueOnce({ 
        id: 1, 
        product_name: 'Actualizado', 
        description: 'Descripción Actualizada', 
        model_url: 'http://test.com/model-updated.glb',
        preview_image_url: 'http://test.com/preview-updated.jpg'
      });

      const response = await request(app)
        .put('/api/models3d/1')
        .set('Authorization', adminToken)
        .set('X-CSRF-Token', 'mock-csrf-token')
        .send({ 
          product_name: 'Actualizado', 
          description: 'Descripción Actualizada', 
          model_url: 'http://test.com/model-updated.glb',
          preview_image_url: 'http://test.com/preview-updated.jpg'
        });

      console.log('PUT /api/models3d/:id response:', response.body); // Para depuración
      expect(response.status).toBe(200);
      expect(Models3d.update).toHaveBeenCalledWith(
        { 
          product_name: 'Actualizado', 
          description: 'Descripción Actualizada', 
          model_url: 'http://test.com/model-updated.glb',
          preview_image_url: 'http://test.com/preview-updated.jpg'
        },
        { where: { id: 1 }, returning: true }
      );
    });
  });

  describe('DELETE /api/models3d/:id', () => {
    it('elimina con auth admin, verifica remoción DB', async () => {
      Models3d.findByPk.mockResolvedValueOnce({ id: 1 });
      Models3d.destroy.mockResolvedValueOnce(1);

      const response = await request(app)
        .delete('/api/models3d/1')
        .set('Authorization', adminToken)
        .set('X-CSRF-Token', 'mock-csrf-token')
        .send();

      console.log('DELETE /api/models3d/:id response:', response.body); // Para depuración
      expect(response.status).toBe(200);
      expect(Models3d.destroy).toHaveBeenCalledWith({ where: { id: 1 } });
    });
  });
});