const models3dController = require('../../src/controllers/models3dController');
const Models3d = require('../../src/models/Models3d');
const loggerUtils = require('../../src/utils/loggerUtils');
const { validationResult } = require('express-validator');

jest.mock('../../src/models/Models3d');
jest.mock('../../src/utils/loggerUtils');
jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
  body: jest.fn().mockReturnValue({
    isString: jest.fn().mockReturnThis(),
    trim: jest.fn().mockReturnThis(),
    notEmpty: jest.fn().mockReturnThis(),
    withMessage: jest.fn().mockReturnThis(),
    isURL: jest.fn().mockReturnThis(),
    optional: jest.fn().mockReturnThis(),
  }),
}));

describe('Models3dController - Unit Tests', () => {
  let req, res;

  beforeEach(() => {
    req = {
      body: {},
      params: {},
      user: { user_id: 1 },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.clearAllMocks();
    validationResult.mockReturnValue({ isEmpty: jest.fn().mockReturnValue(true), array: jest.fn().mockReturnValue([]) });
  });

  describe('createModel3d', () => {
    it('should create a new 3D model', async () => {
      req.body = {
        product_name: 'Test Model',
        description: 'Test Description',
        model_url: 'http://example.com/model.glb',
        preview_image_url: 'http://example.com/preview.png',
      };
      const mockModel = { id: 1, ...req.body };
      Models3d.findOne.mockResolvedValue(null);
      Models3d.create.mockResolvedValue(mockModel);

      await models3dController.createModel3d[models3dController.createModel3d.length - 1](req, res);

      expect(Models3d.create).toHaveBeenCalledWith(expect.objectContaining(req.body));
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({ message: 'Modelo 3D creado exitosamente.', model: mockModel });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'create', 'Modelo 3D creado: Test Model.');
    });

    it('should return 400 if validation fails (missing name)', async () => {
      validationResult.mockReturnValue({
        isEmpty: jest.fn().mockReturnValue(false),
        array: jest.fn().mockReturnValue([{ msg: 'El nombre del producto es obligatorio.' }]),
      });

      await models3dController.createModel3d[models3dController.createModel3d.length - 1](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'El nombre del producto es obligatorio.' }] });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });

    it('should return 400 if validation fails (invalid URL)', async () => {
      req.body = { product_name: 'Test', model_url: 'invalid' };
      validationResult.mockReturnValue({
        isEmpty: jest.fn().mockReturnValue(false),
        array: jest.fn().mockReturnValue([{ msg: 'La URL del modelo es obligatoria y debe ser válida.' }]),
      });

      await models3dController.createModel3d[models3dController.createModel3d.length - 1](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'La URL del modelo es obligatoria y debe ser válida.' }] });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });

    it('should return 400 if product name already exists', async () => {
      req.body = { product_name: 'Test Model', model_url: 'http://example.com/model.glb' };
      Models3d.findOne.mockResolvedValue({ id: 1 });

      await models3dController.createModel3d[models3dController.createModel3d.length - 1](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ message: 'El nombre de este producto 3D ya existe.' });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'create', 'Intento de crear un modelo 3D con nombre duplicado.');
    });

    it('should handle errors', async () => {
      req.body = { product_name: 'Test Model', model_url: 'http://example.com/model.glb' };
      Models3d.findOne.mockRejectedValue(new Error('Database error'));

      await models3dController.createModel3d[models3dController.createModel3d.length - 1](req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error al crear el modelo 3D.', error: 'Database error' });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });
  });

  describe('getModel3dById', () => {
    it('should get a 3D model by ID', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string, ya que parseInt lo maneja
      const mockModel = { id: 1, product_name: 'Test Model' };
      Models3d.findByPk.mockResolvedValue(mockModel);

      await models3dController.getModel3dById(req, res);

      expect(Models3d.findByPk).toHaveBeenCalledWith(1); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ model: mockModel });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'view', 'Obtenido modelo 3D: Test Model.');
    });

    it('should return 404 if model not found', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      Models3d.findByPk.mockResolvedValue(null);

      await models3dController.getModel3dById(req, res);

      expect(Models3d.findByPk).toHaveBeenCalledWith(1); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Modelo 3D no encontrado.' });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'view', 'Intento fallido de obtener modelo 3D por ID: 1.');
    });

    it('should handle errors', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      Models3d.findByPk.mockRejectedValue(new Error('Database error'));

      await models3dController.getModel3dById(req, res);

      expect(Models3d.findByPk).toHaveBeenCalledWith(1); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error al obtener el modelo 3D.', error: 'Database error' });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });
  });

  describe('getAllModels3d', () => {
    it('should get all 3D models', async () => {
      const mockModels = [{ id: 1, product_name: 'Test Model' }];
      Models3d.findAll.mockResolvedValue(mockModels);

      await models3dController.getAllModels3d(req, res);

      expect(Models3d.findAll).toHaveBeenCalledWith({ attributes: expect.any(Array), order: [['product_name', 'ASC']] });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(mockModels);
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'view', 'Obtenidos todos los modelos 3D.');
    });

    it('should handle errors', async () => {
      Models3d.findAll.mockRejectedValue(new Error('Database error'));

      await models3dController.getAllModels3d(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error al obtener los modelos 3D.', error: 'Database error' });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });
  });

  describe('updateModel3d', () => {
    it('should update a 3D model', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      req.body = { product_name: 'Updated Model', model_url: 'http://example.com/updated.glb' };
      Models3d.update.mockResolvedValue([1]);
      Models3d.findByPk.mockResolvedValue({ id: 1, product_name: 'Updated Model' });

      await models3dController.updateModel3d[models3dController.updateModel3d.length - 1](req, res);

      expect(Models3d.update).toHaveBeenCalledWith(
        expect.objectContaining(req.body),
        expect.objectContaining({ where: { id: 1 }, returning: true }) // Cambiar a número
      );
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ message: 'Modelo 3D actualizado exitosamente.' }));
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'update', 'Modelo 3D actualizado: Updated Model.');
    });

    it('should update only optional fields', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      req.body = { description: 'New Desc' };
      Models3d.update.mockResolvedValue([1]);
      Models3d.findByPk.mockResolvedValue({ id: 1, product_name: 'Test', description: 'New Desc' });

      await models3dController.updateModel3d[models3dController.updateModel3d.length - 1](req, res);

      expect(Models3d.update).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'New Desc' }),
        expect.objectContaining({ where: { id: 1 }, returning: true }) // Cambiar a número
      );
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('should return 404 if model not found', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      req.body = { product_name: 'Updated Model' };
      Models3d.update.mockResolvedValue([0]);

      await models3dController.updateModel3d[models3dController.updateModel3d.length - 1](req, res);

      expect(Models3d.update).toHaveBeenCalledWith(
        expect.objectContaining(req.body),
        expect.objectContaining({ where: { id: 1 }, returning: true }) // Cambiar a número
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Modelo 3D no encontrado.' });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'update', 'Intento fallido de actualizar modelo 3D por ID: 1.');
    });

    it('should handle validation errors', async () => {
      validationResult.mockReturnValue({
        isEmpty: jest.fn().mockReturnValue(false),
        array: jest.fn().mockReturnValue([{ msg: 'Invalid input' }]),
      });

      await models3dController.updateModel3d[models3dController.updateModel3d.length - 1](req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ errors: [{ msg: 'Invalid input' }] });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });
  });

  describe('deleteModel3d', () => {
    it('should delete a 3D model', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      Models3d.destroy.mockResolvedValue(1);

      await models3dController.deleteModel3d(req, res);

      expect(Models3d.destroy).toHaveBeenCalledWith({ where: { id: 1 } }); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ message: 'Modelo 3D eliminado exitosamente.' });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'delete', 'Modelo 3D eliminado exitosamente por ID: 1.');
    });

    it('should return 404 if model not found', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      Models3d.destroy.mockResolvedValue(0);

      await models3dController.deleteModel3d(req, res);

      expect(Models3d.destroy).toHaveBeenCalledWith({ where: { id: 1 } }); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ message: 'Modelo 3D no encontrado.' });
      expect(loggerUtils.logUserActivity).toHaveBeenCalledWith(1, 'delete', 'Intento fallido de eliminar modelo 3D por ID: 1.');
    });

    it('should handle errors', async () => {
      req.params = { id: '1' }; // Puede seguir siendo string
      Models3d.destroy.mockRejectedValue(new Error('Database error'));

      await models3dController.deleteModel3d(req, res);

      expect(Models3d.destroy).toHaveBeenCalledWith({ where: { id: 1 } }); // Cambiar a número
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ message: 'Error al eliminar el modelo 3D.', error: 'Database error' });
      expect(loggerUtils.logCriticalError).toHaveBeenCalled();
    });
  });
});