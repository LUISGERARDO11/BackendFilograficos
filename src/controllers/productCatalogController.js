const { body, query, validationResult } = require('express-validator');
const { Product, Category, Collaborator, ProductAttribute, ProductAttributeValue, CustomizationOption, ProductImage, CategoryAttributes } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { uploadProductImagesToCloudinary } = require('../services/cloudinaryService');

// Validación para registrar un producto
const validateProduct = [
  body('sku').trim().notEmpty().withMessage('El SKU es obligatorio').escape(),
  body('name').trim().notEmpty().withMessage('El nombre es obligatorio').escape(),
  body('description').optional().trim().escape(),
  body('product_type').isIn(['Existencia', 'semi_personalizado', 'personalizado']).withMessage('Tipo de producto no válido'),
  body('category_id').isInt().withMessage('El ID de la categoría debe ser un número entero'),
  body('attributes').isArray().withMessage('Los atributos deben ser un arreglo').optional({ nullable: true }),
  body('attributes.*.attribute_id').isInt().withMessage('El ID del atributo debe ser un número entero'),
  body('attributes.*.value').trim().notEmpty().withMessage('El valor del atributo es obligatorio'),
  body('customizations').optional().isArray().withMessage('Las personalizaciones deben ser un arreglo'),
  body('customizations.*.type').optional().isIn(['Imagen', 'Texto']).withMessage('Tipo de personalización no válido'),
  body('customizations.*.description').optional().trim().notEmpty().withMessage('La descripción de la personalización es obligatoria'),
  body('production_cost').isFloat({ min: 0 }).withMessage('El costo de producción debe ser un número positivo'),
  body('profit_margin').isFloat({ min: 0 }).withMessage('El margen de ganancia debe ser un número positivo'),
  body('collaborator_id').optional({ nullable: true }).isInt().withMessage('El ID del colaborador debe ser un número entero'),
  body('stock_threshold').optional().isInt({ min: 0 }).withMessage('El umbral de stock debe ser un número entero positivo')
];

// Validación para los parámetros de consulta
const validateGetProducts = [
    query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un número entero positivo'),
    query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un número entero positivo'),
    query('sort').optional().isString().withMessage('El parámetro de ordenamiento debe ser una cadena (e.g., "sku:ASC,name:DESC")')
];

// Crear un producto
exports.createProduct = [
  validateProduct,
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { sku, name, description, product_type, category_id, attributes, customizations, production_cost, profit_margin, collaborator_id, stock_threshold } = req.body;
    const images = req.files;

    try {
      // Convertir category_id a número
      const categoryIdNum = parseInt(category_id, 10);

      // 1. Verificar unicidad del SKU
      const existingProduct = await Product.findOne({ where: { sku } });
      if (existingProduct) {
        return res.status(400).json({ message: 'El SKU ya existe' });
      }

      // 2. Validar categoría
      const category = await Category.findByPk(categoryIdNum);
      if (!category) {
        return res.status(404).json({ message: 'Categoría no encontrada' });
      }

      // 3. Validar atributos (si se proporcionan)
      if (attributes && attributes.length > 0) {
        const validAttributes = await ProductAttribute.findAll({
          include: [{
            model: Category,
            as: 'categories',
            where: { category_id: categoryIdNum }, // Usar el número
            through: { attributes: [] },
            attributes: []
          }],
          where: { is_deleted: false }
        });
        const validAttributeIds = validAttributes.map(attr => attr.attribute_id);

        for (const attr of attributes) {
          const attributeIdNum = parseInt(attr.attribute_id, 10); // Convertir a número
          if (!validAttributeIds.includes(attributeIdNum)) {
            return res.status(400).json({ message: `El atributo con ID ${attributeIdNum} no pertenece a esta categoría` });
          }
          const attribute = validAttributes.find(a => a.attribute_id === attributeIdNum);
          if (attribute.data_type === 'lista' && attribute.allowed_values) {
            const allowed = attribute.allowed_values.split(',');
            if (!allowed.includes(attr.value)) {
              return res.status(400).json({ message: `El valor "${attr.value}" no es permitido para el atributo "${attribute.attribute_name}"` });
            }
          }
          if (attribute.data_type === 'numero' && isNaN(parseFloat(attr.value))) {
            return res.status(400).json({ message: `El valor "${attr.value}" debe ser un número para el atributo "${attribute.attribute_name}"` });
          }
        }
      }

      // 4. Validar colaborador (si se proporciona)
      if (collaborator_id) {
        const collaborator = await Collaborator.findByPk(collaborator_id);
        if (!collaborator) {
          return res.status(404).json({ message: 'Colaborador no encontrado' });
        }
      }

      // 5. Validar personalizaciones (si se proporcionan y el tipo lo permite)
      if (product_type === 'Existencia' && customizations && customizations.length > 0) {
        return res.status(400).json({ message: 'Los productos de tipo "Existencia" no pueden tener personalizaciones' });
      }

      // 6. Calcular precio final con 2 decimales
      const calculated_price = parseFloat((production_cost * (1 + profit_margin / 100)).toFixed(2));

      // 7. Crear el producto
      const newProduct = await Product.create({
        sku,
        name,
        description: description || null,
        product_type,
        category_id,
        collaborator_id: collaborator_id || null,
        production_cost,
        profit_margin,
        calculated_price,
        stock: 0,
        stock_threshold: stock_threshold !== undefined ? stock_threshold : undefined, // Usar valor proporcionado o dejar que el default de la BD se aplique
        status: 'activo'
      });

      // 8. Guardar valores de atributos (si se proporcionan)
      if (attributes && attributes.length > 0) {
        const attributeValues = attributes.map(attr => ({
          product_id: newProduct.product_id,
          attribute_id: attr.attribute_id,
          value: attr.value
        }));
        await ProductAttributeValue.bulkCreate(attributeValues);
      }

      // 9. Guardar opciones de personalización (si aplica)
      if (product_type !== 'Existencia' && customizations && customizations.length > 0) {
        const customizationOptions = customizations.map(cust => ({
          product_id: newProduct.product_id,
          type: cust.type,
          description: cust.description
        }));
        await CustomizationOption.bulkCreate(customizationOptions);
      }

      // 10. Guardar imágenes en Cloudinary (si se subieron)
      let imageRecords = [];
      if (images && images.length > 0) {
        imageRecords = await Promise.all(
          images.map(async (image, index) => {
            const imageUrl = await uploadProductImagesToCloudinary(image.buffer, `${newProduct.sku}-${index + 1}-${image.originalname}`);
            return {
              id_producto: newProduct.product_id,
              url_imagen: imageUrl, // Cambia 'image_url' a 'url_imagen'
              orden: index + 1 // Cambia 'order' a 'orden'
            };
          })
        );
        await ProductImage.bulkCreate(imageRecords);
      }

      loggerUtils.logUserActivity(req.user?.user_id || 'system', 'create', `Producto creado: ${name} (SKU: ${sku})`);
      res.status(201).json({
        message: 'Producto creado exitosamente',
        product: {
          ...newProduct.dataValues,
          attributes: attributes || [],
          customizations: (product_type !== 'Existencia' && customizations) ? customizations : [],
          images: imageRecords
        }
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al crear el producto', error: error.message });
    }
  }
];

// Obtener todos los productos activos del catálogo
exports.getAllProducts = [
  validateGetProducts,
  async (req, res) => {
    try {
      const { page: pageParam, pageSize: pageSizeParam, sort } = req.query;
      const page = parseInt(pageParam) || 1;
      const pageSize = parseInt(pageSizeParam) || 10;

      // Validación de parámetros de paginación
      if (page < 1 || pageSize < 1 || isNaN(page) || isNaN(pageSize)) {
        return res.status(400).json({ 
          message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos' 
        });
      }

      // Procesar el parámetro de ordenamiento
      let order = [['sku', 'ASC']]; // Orden por defecto: SKU ascendente
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['sku', 'name', 'calculated_price', 'stock'];
        const validDirections = ['ASC', 'DESC'];

        order = sortParams.map(([column, direction]) => {
          if (!validColumns.includes(column)) {
            throw new Error(`Columna de ordenamiento inválida: ${column}. Use: ${validColumns.join(', ')}`);
          }
          if (!direction || !validDirections.includes(direction.toUpperCase())) {
            throw new Error(`Dirección de ordenamiento inválida: ${direction}. Use: ASC o DESC`);
          }
          return [column, direction.toUpperCase()];
        });
      }

      // Consulta para obtener productos activos con paginación y ordenamiento
      const { count, rows: products } = await Product.findAndCountAll({
        where: { status: 'activo' }, // Solo productos activos
        attributes: ['sku', 'name', 'product_type', 'calculated_price', 'stock'], // Campos requeridos del producto
        include: [
          {
            model: Category,
            attributes: ['name'], // Nombre de la categoría
            as: 'category'
          },
          {
            model: ProductImage,
            attributes: ['url_imagen'], // Nombre correcto de la columna
            where: { orden: 1 }, // Cambia 'order' a 'orden'
            required: false, // LEFT JOIN para incluir productos sin imágenes
            as: 'ProductImages'
          }
        ],
        order,
        limit: pageSize,
        offset: (page - 1) * pageSize
      });

      // Formatear la respuesta
      const formattedProducts = products.map(product => ({
        sku: product.sku,
        name: product.name,
        category: product.category ? product.category.name : null,
        product_type: product.product_type,
        price: product.calculated_price,
        stock: product.stock,
        image_url: product.ProductImages.length > 0 ? product.ProductImages[0].url_imagen : null
      }));

      res.status(200).json({
        message: 'Productos obtenidos exitosamente',
        products: formattedProducts,
        total: count,
        page,
        pageSize
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener los productos', error: error.message });
    }
  }
];