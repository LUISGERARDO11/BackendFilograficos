const { Op } = require('sequelize');
const { Product, ProductVariant, Category, Collaborator, ProductAttribute, ProductAttributeValue, CustomizationOption, ProductImage, PriceHistory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { uploadProductImagesToCloudinary } = require('../services/cloudinaryService');
const { query, validationResult } = require('express-validator');

const validateGetAllProducts = [
  query('search').optional().trim().escape(),
  query('collaborator_id').optional().isInt({ min: 1 }).withMessage('El ID del colaborador debe ser un entero positivo'),
  query('category_id').optional().isInt({ min: 1 }).withMessage('El ID de la categoría debe ser un entero positivo'),
  query('product_type')
    .optional()
    .isIn(['Existencia', 'semi_personalizado', 'personalizado'])
    .withMessage('El tipo de producto debe ser "Existencia", "semi_personalizado" o "personalizado"'),
  query('page').optional().isInt({ min: 1 }).withMessage('La página debe ser un entero positivo'),
  query('pageSize').optional().isInt({ min: 1 }).withMessage('El tamaño de página debe ser un entero positivo'),
  query('sort')
    .optional()
    .matches(/^([a-zA-Z_]+:(ASC|DESC),?)+$/i)
    .withMessage('El parámetro sort debe tener el formato "column:direction,column:direction" (ejemplo: "name:ASC,total_stock:DESC")')
];

// Crear un producto con variantes
exports.createProduct = async (req, res) => {
  let { name, description, product_type, category_id, collaborator_id, variants } = req.body;
  const files = req.files;
  const userId = req.user?.user_id || 'system'; // Obtener el ID del usuario desde el request

  try {
    // Parsear variants si es una cadena JSON
    if (typeof variants === 'string') {
      variants = JSON.parse(variants);
    }

    // Validar que variants sea un array
    if (!Array.isArray(variants)) {
      return res.status(400).json({ message: 'Las variantes deben ser un arreglo' });
    }

    // Validar categoría
    const categoryIdNum = parseInt(category_id, 10);
    const category = await Category.findByPk(categoryIdNum);
    if (!category) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    // Validar colaborador (si se proporciona)
    if (collaborator_id) {
      const collaborator = await Collaborator.findByPk(collaborator_id);
      if (!collaborator) {
        return res.status(404).json({ message: 'Colaborador no encontrado' });
      }
    }

    // Crear el producto base
    const newProduct = await Product.create({
      name,
      description: description || null,
      product_type,
      category_id: categoryIdNum,
      collaborator_id: collaborator_id || null,
      status: 'active'
    });

    // Validar y crear variantes
    const variantRecords = [];
    const attributeRecords = [];
    const customizationRecords = [];
    const imageRecords = [];
    const priceHistoryRecords = [];

    for (const [index, variant] of variants.entries()) {
      // Verificar unicidad del SKU
      const existingVariant = await ProductVariant.findOne({ where: { sku: variant.sku } });
      if (existingVariant) {
        await newProduct.destroy(); // Rollback si falla
        return res.status(400).json({ message: `El SKU ${variant.sku} ya existe` });
      }

      // Validar imágenes: al menos 1 y máximo 10 por variante
      const variantImages = files ? files.filter(file => file.fieldname === `variants[${index}][images]`) : [];
      if (variantImages.length < 1) {
        await newProduct.destroy(); // Rollback si falla
        return res.status(400).json({ message: `La variante ${variant.sku} debe tener al menos 1 imagen` });
      }
      if (variantImages.length > 10) {
        await newProduct.destroy(); // Rollback si falla
        return res.status(400).json({ message: `La variante ${variant.sku} no puede tener más de 10 imágenes` });
      }

      // Calcular precio
      const calculated_price = parseFloat((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));

      // Crear variante
      const newVariant = await ProductVariant.create({
        product_id: newProduct.product_id,
        sku: variant.sku,
        production_cost: variant.production_cost,
        profit_margin: variant.profit_margin,
        calculated_price,
        stock: variant.stock,
        stock_threshold: variant.stock_threshold !== undefined ? variant.stock_threshold : 10
      });

      variantRecords.push(newVariant);

      // Registrar en PriceHistory el precio inicial
      priceHistoryRecords.push({
        variant_id: newVariant.variant_id,
        previous_production_cost: 0, // Como es el primer registro, el previo es 0
        new_production_cost: parseFloat(variant.production_cost),
        previous_profit_margin: 0, // Como es el primer registro, el previo es 0
        new_profit_margin: parseFloat(variant.profit_margin),
        previous_calculated_price: 0, // Como es el primer registro, el previo es 0
        new_calculated_price: calculated_price,
        change_type: 'initial',
        changed_by: userId,
        change_date: new Date()
      });

      // Guardar atributos de la variante
      if (variant.attributes && variant.attributes.length > 0) {
        const validAttributes = await ProductAttribute.findAll({
          include: [{
            model: Category,
            where: { category_id: categoryIdNum },
            through: { attributes: [] }
          }],
          where: { is_deleted: false }
        });
        const validAttributeIds = validAttributes.map(attr => attr.attribute_id);

        for (const attr of variant.attributes) {
          const attributeIdNum = parseInt(attr.attribute_id, 10);
          if (!validAttributeIds.includes(attributeIdNum)) {
            await newProduct.destroy(); // Rollback si falla
            return res.status(400).json({ message: `El atributo con ID ${attributeIdNum} no pertenece a esta categoría` });
          }
          const attribute = validAttributes.find(a => a.attribute_id === attributeIdNum);
          if (attribute.data_type === 'lista' && attribute.allowed_values) {
            const allowed = attribute.allowed_values.split(',');
            if (!allowed.includes(attr.value)) {
              await newProduct.destroy(); // Rollback si falla
              return res.status(400).json({ message: `El valor "${attr.value}" no es permitido para el atributo "${attribute.attribute_name}"` });
            }
          }
          attributeRecords.push({
            variant_id: newVariant.variant_id,
            attribute_id: attributeIdNum,
            value: attr.value
          });
        }
      }

      // Guardar personalizaciones
      if (product_type !== 'Existencia' && variant.customizations && variant.customizations.length > 0) {
        customizationRecords.push(...variant.customizations.map(cust => ({
          product_id: newProduct.product_id,
          type: cust.type,
          description: cust.description
        })));
      }

      // Guardar imágenes
      const imagesForVariant = await Promise.all(
        variantImages.map(async (image, idx) => {
          const imageData = await uploadProductImagesToCloudinary(image.buffer, `${variant.sku}-${idx + 1}-${image.originalname}`);
          return {
            variant_id: newVariant.variant_id,
            image_url: imageData.secure_url, // URL para mostrar la imagen
            public_id: imageData.public_id,  // ID para gestionar en Cloudinary
            order: idx + 1
          };
        })
      );
      imageRecords.push(...imagesForVariant);
    }

    // Guardar registros en bulk
    if (attributeRecords.length > 0) await ProductAttributeValue.bulkCreate(attributeRecords);
    if (customizationRecords.length > 0) await CustomizationOption.bulkCreate(customizationRecords);
    if (imageRecords.length > 0) await ProductImage.bulkCreate(imageRecords);
    if (priceHistoryRecords.length > 0) await PriceHistory.bulkCreate(priceHistoryRecords);

    loggerUtils.logUserActivity(userId, 'create', `Producto creado: ${name} (${newProduct.product_id})`);
    res.status(201).json({
      message: 'Producto creado exitosamente',
      product: {
        ...newProduct.dataValues,
        variants: variantRecords.map((v, i) => ({
          ...v.dataValues,
          attributes: variants[i].attributes || [],
          customizations: variants[i].customizations || [],
          images: imageRecords.filter(img => img.variant_id === v.variant_id)
        }))
      }
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al crear el producto', error: error.message });
  }
};

// Obtener todos los productos activos del catálogo
exports.getAllProducts = [
  validateGetAllProducts,
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ message: 'Errores de validación', errors: errors.array() });
      }

      const {
        search,
        collaborator_id,
        category_id,
        product_type,
        page: pageParam = 1,
        pageSize: pageSizeParam = 10,
        sort
      } = req.query;

      const page = parseInt(pageParam);
      const pageSize = parseInt(pageSizeParam);

      if (page < 1 || pageSize < 1) {
        return res.status(400).json({ message: 'Parámetros de paginación inválidos. Deben ser números enteros positivos' });
      }

      // Filtros
      const where = { status: 'active' };

      if (search) {
        where[Op.or] = [
          { name: { [Op.like]: `%${search}%` } },
          { '$Category.name$': { [Op.like]: `%${search}%` } }
        ];
        if (!isNaN(parseFloat(search))) {
          where[Op.or].push(
            { '$ProductVariants.calculated_price$': { [Op.between]: [parseFloat(search) - 0.01, parseFloat(search) + 0.01] } },
            { '$ProductVariants.stock$': parseInt(search) }
          );
        }
      }

      if (collaborator_id) {
        where.collaborator_id = parseInt(collaborator_id);
        const collaboratorExists = await Collaborator.findByPk(collaborator_id);
        if (!collaboratorExists) {
          return res.status(404).json({ message: 'Colaborador no encontrado' });
        }
      }

      if (category_id) {
        where.category_id = parseInt(category_id);
        const categoryExists = await Category.findByPk(category_id);
        if (!categoryExists) {
          return res.status(404).json({ message: 'Categoría no encontrada' });
        }
      }

      if (product_type) {
        where.product_type = product_type;
      }

      // Ordenamiento
      let order = [['product_id', 'ASC']];
      if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['name', 'variant_count', 'min_price', 'max_price', 'total_stock'];
        const validDirections = ['ASC', 'DESC'];

        order = sortParams.map(([column, direction]) => {
          if (!validColumns.includes(column)) {
            throw new Error(`Columna de ordenamiento inválida: ${column}. Use: ${validColumns.join(', ')}`);
          }
          if (!direction || !validDirections.includes(direction.toUpperCase())) {
            throw new Error(`Dirección de ordenamiento inválida: ${direction}. Use: ASC o DESC`);
          }
          if (['variant_count', 'min_price', 'max_price', 'total_stock'].includes(column)) {
            return [Product.sequelize.literal(column), direction.toUpperCase()];
          }
          return [column, direction.toUpperCase()];
        });
      }

      const { count, rows: products } = await Product.findAndCountAll({
        where,
        attributes: [
          'product_id',
          'name',
          'product_type',
          'created_at',
          'updated_at',
          [
            Product.sequelize.fn('COUNT', Product.sequelize.col('ProductVariants.variant_id')),
            'variant_count'
          ],
          [
            Product.sequelize.fn('MIN', Product.sequelize.col('ProductVariants.calculated_price')),
            'min_price'
          ],
          [
            Product.sequelize.fn('MAX', Product.sequelize.col('ProductVariants.calculated_price')),
            'max_price'
          ],
          [
            Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.stock')),
            'total_stock'
          ]
        ],
        include: [
          { model: Category, attributes: ['name'] },
          {
            model: ProductVariant,
            attributes: [],
            required: false
          },
          {
            model: Collaborator,
            attributes: ['name'],
            required: false
          }
        ],
        group: [
          'Product.product_id',
          'Product.name',
          'Product.product_type',
          'Product.created_at',
          'Product.updated_at',
          'Category.category_id',
          'Category.name',
          'Collaborator.collaborator_id',
          'Collaborator.name'
        ],
        order,
        limit: pageSize,
        offset: (page - 1) * pageSize,
        subQuery: false
      });

      const formattedProducts = await Promise.all(products.map(async (product) => {
        const firstVariant = await ProductVariant.findOne({
          where: { product_id: product.product_id },
          include: [{ model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false }],
          order: [['variant_id', 'ASC']]
        });

        return {
          product_id: product.product_id,
          name: product.name,
          category: product.Category ? product.Category.name : null,
          product_type: product.product_type,
          variant_count: parseInt(product.get('variant_count')) || 0,
          min_price: parseFloat(product.get('min_price')) || 0,
          max_price: parseFloat(product.get('max_price')) || 0,
          total_stock: parseInt(product.get('total_stock')) || 0,
          created_at: product.created_at,
          updated_at: product.updated_at,
          image_url: firstVariant && firstVariant.ProductImages.length > 0 ? firstVariant.ProductImages[0].image_url : null,
          collaborator: product.Collaborator ? product.Collaborator.name : null
        };
      }));

      res.status(200).json({
        message: 'Productos obtenidos exitosamente',
        products: formattedProducts,
        total: count.length,
        page,
        pageSize
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener los productos', error: error.message });
    }
  }
];

// Eliminar lógicamente un producto
exports.deleteProduct = async (req, res) => {
  const { product_id } = req.params;

  try {
    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    if (product.status === 'inactive') {
      return res.status(400).json({ message: 'El producto ya está inactivo' });
    }

    await product.update({ status: 'inactive' });
    await ProductVariant.update({ status: 'inactive' }, { where: { product_id } });

    loggerUtils.logUserActivity(req.user?.user_id || 'system', 'delete', `Producto eliminado lógicamente: ${product.name} (${product_id})`);
    res.status(200).json({ message: 'Producto eliminado lógicamente exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar el producto', error: error.message });
  }
};

// Obtener un producto por ID
exports.getProductById = async (req, res) => {
  const { product_id } = req.params;

  try {
    const product = await Product.findByPk(product_id, {
      include: [
        { model: Category, attributes: ['category_id', 'name'] },
        { model: Collaborator, attributes: ['collaborator_id', 'name'] },
        {
          model: ProductVariant,
          include: [
            { model: ProductAttributeValue, include: [{ model: ProductAttribute, attributes: ['attribute_id', 'attribute_name', 'data_type', 'allowed_values'] }] },
            { model: ProductImage, attributes: ['image_url', 'order'] }
          ]
        },
        { model: CustomizationOption, attributes: ['type', 'description'] }
      ]
    });

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const formattedProduct = {
      product_id: product.product_id,
      name: product.name,
      description: product.description,
      product_type: product.product_type,
      category: product.Category ? { category_id: product.Category.category_id, name: product.Category.name } : null,
      collaborator: product.Collaborator ? { collaborator_id: product.Collaborator.collaborator_id, name: product.Collaborator.name } : null,
      status: product.status,
      variants: product.ProductVariants.map(variant => ({
        variant_id: variant.variant_id,
        sku: variant.sku,
        production_cost: variant.production_cost,
        profit_margin: variant.profit_margin,
        calculated_price: variant.calculated_price,
        stock: variant.stock,
        stock_threshold: variant.stock_threshold,
        attributes: variant.ProductAttributeValues.map(attr => ({
          attribute_id: attr.ProductAttribute.attribute_id,
          attribute_name: attr.ProductAttribute.attribute_name,
          value: attr.value,
          data_type: attr.ProductAttribute.data_type,
          allowed_values: attr.ProductAttribute.allowed_values
        })),
        images: variant.ProductImages.map(img => ({
          image_url: img.image_url,
          order: img.order
        }))
      })),
      customizations: product.CustomizationOptions.map(cust => ({
        type: cust.type,
        description: cust.description
      }))
    };

    res.status(200).json({
      message: 'Producto obtenido exitosamente',
      product: formattedProduct
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el producto', error: error.message });
  }
};

// Actualizar un producto con variantes
exports.updateProduct = async (req, res) => {
  const { product_id } = req.params;
  let { name, description, product_type, category_id, collaborator_id, variants } = req.body;
  const files = req.files;
  const userId = req.user?.user_id || 'system';

  try {
    const product = await Product.findByPk(product_id, {
      include: [{ model: ProductVariant, include: [ProductImage] }]
    });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    // Actualizar datos básicos del producto si se proporcionan
    if (category_id) {
      const category = await Category.findByPk(parseInt(category_id, 10));
      if (!category) return res.status(404).json({ message: 'Categoría no encontrada' });
    }
    if (collaborator_id) {
      const collaborator = await Collaborator.findByPk(collaborator_id);
      if (!collaborator) return res.status(404).json({ message: 'Colaborador no encontrado' });
    }
    await product.update({
      name: name || product.name,
      description: description !== undefined ? description : product.description,
      product_type: product_type || product.product_type,
      category_id: category_id ? parseInt(category_id, 10) : product.category_id,
      collaborator_id: collaborator_id || product.collaborator_id
    });

    // Manejar variantes si se proporcionan
    if (variants) {
      if (typeof variants === 'string') variants = JSON.parse(variants);
      if (!Array.isArray(variants)) return res.status(400).json({ message: 'Las variantes deben ser un arreglo' });

      const priceHistoryRecords = [];
      const existingVariants = product.ProductVariants.reduce((acc, v) => {
        acc[v.variant_id] = v;
        return acc;
      }, {});

      for (const [index, variant] of variants.entries()) {
        const variantImages = files ? files.filter(file => file.fieldname === `variants[${index}][images]`) : [];

        if (variant.variant_id) {
          // Actualizar variante existente
          const existingVariant = existingVariants[variant.variant_id];
          if (!existingVariant) return res.status(404).json({ message: `Variante ${variant.variant_id} no encontrada` });

          const newProductionCost = variant.production_cost !== undefined ? parseFloat(variant.production_cost) : existingVariant.production_cost;
          const newProfitMargin = variant.profit_margin !== undefined ? parseFloat(variant.profit_margin) : existingVariant.profit_margin;
          const newCalculatedPrice = parseFloat((newProductionCost * (1 + newProfitMargin / 100)).toFixed(2));

          if (newProductionCost !== existingVariant.production_cost || newProfitMargin !== existingVariant.profit_margin) {
            priceHistoryRecords.push({
              variant_id: existingVariant.variant_id,
              previous_production_cost: existingVariant.production_cost,
              new_production_cost: newProductionCost,
              previous_profit_margin: existingVariant.profit_margin,
              new_profit_margin: newProfitMargin,
              previous_calculated_price: existingVariant.calculated_price,
              new_calculated_price: newCalculatedPrice,
              change_type: 'manual',
              changed_by: userId,
              change_date: new Date()
            });
          }

          await existingVariant.update({
            production_cost: newProductionCost,
            profit_margin: newProfitMargin,
            calculated_price: newCalculatedPrice,
            stock: variant.stock !== undefined ? variant.stock : existingVariant.stock,
            stock_threshold: variant.stock_threshold !== undefined ? variant.stock_threshold : existingVariant.stock_threshold
          });

          // Eliminar imágenes
          if (variant.imagesToDelete && Array.isArray(variant.imagesToDelete)) {
            for (const imageId of variant.imagesToDelete) {
              const image = await ProductImage.findByPk(imageId);
              if (image && image.variant_id === existingVariant.variant_id) {
                await deleteFromCloudinary(image.public_id); // Eliminar físicamente usando public_id
                await image.destroy();
              }
            }
          }

          // Agregar nuevas imágenes
          if (variantImages.length > 0) {
            const currentImageCount = existingVariant.ProductImages.length - (variant.imagesToDelete?.length || 0);
            if (currentImageCount + variantImages.length > 10) {
              return res.status(400).json({ message: `La variante ${existingVariant.sku} no puede tener más de 10 imágenes` });
            }
            const newImages = await Promise.all(
              variantImages.map(async (image, idx) => {
                const imageData = await uploadProductImagesToCloudinary(image.buffer, `${existingVariant.sku}-${currentImageCount + idx + 1}-${image.originalname}`);
                return {
                  variant_id: existingVariant.variant_id,
                  image_url: imageData.secure_url,
                  public_id: imageData.public_id,
                  order: currentImageCount + idx + 1
                };
              })
            );
            await ProductImage.bulkCreate(newImages);
          }
        } else {
          // Crear nueva variante
          const existingVariant = await ProductVariant.findOne({ where: { sku: variant.sku } });
          if (existingVariant) return res.status(400).json({ message: `El SKU ${variant.sku} ya existe` });

          if (variantImages.length < 1) return res.status(400).json({ message: `La variante ${variant.sku} debe tener al menos 1 imagen` });
          if (variantImages.length > 10) return res.status(400).json({ message: `La variante ${variant.sku} no puede tener más de 10 imágenes` });

          const calculated_price = parseFloat((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));
          const newVariant = await ProductVariant.create({
            product_id: product.product_id,
            sku: variant.sku,
            production_cost: variant.production_cost,
            profit_margin: variant.profit_margin,
            calculated_price,
            stock: variant.stock,
            stock_threshold: variant.stock_threshold !== undefined ? variant.stock_threshold : 10
          });

          priceHistoryRecords.push({
            variant_id: newVariant.variant_id,
            previous_production_cost: 0,
            new_production_cost: parseFloat(variant.production_cost),
            previous_profit_margin: 0,
            new_profit_margin: parseFloat(variant.profit_margin),
            previous_calculated_price: 0,
            new_calculated_price: calculated_price,
            change_type: 'initial',
            changed_by: userId,
            change_date: new Date()
          });

          const newImages = await Promise.all(
            variantImages.map(async (image, idx) => {
              const imageData = await uploadProductImagesToCloudinary(image.buffer, `${variant.sku}-${idx + 1}-${image.originalname}`);
              return {
                variant_id: newVariant.variant_id,
                image_url: imageData.secure_url,
                public_id: imageData.public_id,
                order: idx + 1
              };
            })
          );
          await ProductImage.bulkCreate(newImages);
        }
      }

      if (priceHistoryRecords.length > 0) await PriceHistory.bulkCreate(priceHistoryRecords);
    }

    loggerUtils.logUserActivity(userId, 'update', `Producto actualizado: ${product.name} (${product_id})`);
    const updatedProduct = await Product.findByPk(product_id, { include: [{ model: ProductVariant, include: [ProductImage] }] });
    res.status(200).json({ message: 'Producto actualizado exitosamente', product: updatedProduct });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar el producto', error: error.message });
  }
};

// Eliminar una variante específica
exports.deleteVariant = async (req, res) => {
  const { product_id, variant_id } = req.params;
  const userId = req.user?.user_id || 'system';

  try {
    const product = await Product.findByPk(product_id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    const variant = await ProductVariant.findOne({
      where: { variant_id, product_id },
      include: [ProductImage]
    });
    if (!variant) return res.status(404).json({ message: 'Variante no encontrada' });

    // Eliminar imágenes asociadas físicamente
    if (variant.ProductImages.length > 0) {
      await Promise.all(
        variant.ProductImages.map(async (image) => {
          await deleteFromCloudinary(image.public_id); // Eliminar de Cloudinary usando public_id
          await image.destroy(); // Eliminar de la base de datos
        })
      );
    }

    // Eliminar la variante
    await variant.destroy();

    loggerUtils.logUserActivity(userId, 'delete', `Variante ${variant.sku} eliminada del producto ${product_id}`);
    res.status(200).json({ message: 'Variante eliminada exitosamente' });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar la variante', error: error.message });
  }
};