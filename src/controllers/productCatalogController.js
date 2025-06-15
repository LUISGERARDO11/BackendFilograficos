const { Op } = require('sequelize');
const { Product, ProductVariant, CustomizationOption, ProductImage, PriceHistory, Category, Collaborator, ProductAttributeValue, ProductAttribute } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const {
  validateCategory, validateCollaborator, processVariantImages, createPriceHistoryRecord, validateUniqueSku,
  formatProductResponse, buildSearchFilters, parseAndValidateInput, createProductBase, createCustomizationOptions,
  processVariants, parseUpdateInput, updateProductBase, updateCustomizations, updateOrCreateVariant
} = require('../utils/productCatalogUtils');
const { deleteFromCloudinary } = require('../services/cloudinaryService');

// Crear un producto con variantes
exports.createProduct = async (req, res) => {
  const { name, description, product_type, category_id, collaborator_id, variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost } = req.body;
  const files = req.files;
  const userId = req.user?.user_id ?? 'system';
  let newProduct;

  try {
    const { parsedVariants, parsedCustomizations } = parseAndValidateInput(variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost);
    newProduct = await createProductBase(name, description, product_type, category_id, collaborator_id, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost);
    const customizationRecords = createCustomizationOptions(newProduct.product_id, product_type, parsedCustomizations);
    const { attributeRecords, imageRecords, priceHistoryRecords } = await processVariants(newProduct.product_id, parsedVariants, files, newProduct.category_id, userId);

    await Promise.all([
      customizationRecords.length > 0 && CustomizationOption.bulkCreate(customizationRecords),
      attributeRecords.length > 0 && ProductAttributeValue.bulkCreate(attributeRecords),
      imageRecords.length > 0 && ProductImage.bulkCreate(imageRecords),
      priceHistoryRecords.length > 0 && PriceHistory.bulkCreate(priceHistoryRecords)
    ]);

    const createdProduct = await Product.findByPk(newProduct.product_id, {
      include: [
        {
          model: ProductVariant,
          include: [
            ProductImage,
            {
              model: ProductAttributeValue,
              include: [ProductAttribute]
            }
          ]
        },
        { model: CustomizationOption },
        { model: Category },
        { model: Collaborator }
      ]
    });

    loggerUtils.logUserActivity(userId, 'create', `Producto creado: ${name} (${newProduct.product_id})`);
    res.status(201).json({ message: 'Producto creado exitosamente', product: formatProductResponse(createdProduct) });
  } catch (error) {
    if (newProduct) await Product.destroy({ where: { product_id: newProduct.product_id } });
    loggerUtils.logCriticalError(error);
    res.status(error.message.includes('no encontrada') ? 404 : 400).json({ message: 'Error al crear el producto', error: error.message });
  }
};

// Obtener todos los productos activos
exports.getAllProducts = async (req, res) => {
  try {
    const { search, collaborator_id, category_id, product_type, page = 1, pageSize = 10, sort } = req.query;
    const pageNum = Number(page);
    const pageSizeNum = Number(pageSize);

    if (pageNum < 1 || pageSizeNum < 1) throw new Error('Parámetros de paginación inválidos');

    const where = buildSearchFilters(search);
    if (collaborator_id) where.collaborator_id = await validateCollaborator(collaborator_id);
    if (category_id) where.category_id = await validateCategory(category_id);
    if (product_type) where.product_type = product_type;

    let order = [['product_id', 'ASC']];
    if (sort) {
      const validColumns = ['name', 'variant_count', 'min_price', 'max_price', 'total_stock'];
      order = sort.split(',').map(param => {
        const [column, direction] = param.trim().split(':');
        if (!validColumns.includes(column) || !['ASC', 'DESC'].includes(direction?.toUpperCase())) {
          throw new Error('Parámetro de ordenamiento inválido');
        }
        return ['variant_count', 'min_price', 'max_price', 'total_stock'].includes(column)
          ? [Product.sequelize.literal(column), direction.toUpperCase()]
          : [column, direction.toUpperCase()];
      });
    }

    const { count, rows: products } = await Product.findAndCountAll({
      where,
      attributes: [
        'product_id', 'name', 'product_type', 'created_at', 'updated_at', 'standard_delivery_days', 'urgent_delivery_enabled', 'urgent_delivery_days', 'urgent_delivery_cost',
        [Product.sequelize.fn('COUNT', Product.sequelize.col('ProductVariants.variant_id')), 'variant_count'],
        [Product.sequelize.fn('MIN', Product.sequelize.col('ProductVariants.calculated_price')), 'min_price'],
        [Product.sequelize.fn('MAX', Product.sequelize.col('ProductVariants.calculated_price')), 'max_price'],
        [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.stock')), 'total_stock']
      ],
      include: [
        { model: Category, attributes: ['name'] },
        { model: ProductVariant, attributes: [], where: { is_deleted: false }, required: false },
        { model: Collaborator, attributes: ['name'], required: false }
      ],
      group: [
        'Product.product_id', 'Product.name', 'Product.product_type', 'Product.created_at', 'Product.updated_at',
        'Product.standard_delivery_days', 'Product.urgent_delivery_enabled', 'Product.urgent_delivery_days', 'Product.urgent_delivery_cost',
        'Category.category_id', 'Category.name', 'Collaborator.collaborator_id', 'Collaborator.name'
      ],
      order,
      limit: pageSizeNum,
      offset: (pageNum - 1) * pageSizeNum,
      subQuery: false
    });

    const formattedProducts = await Promise.all(products.map(async product => ({
      product_id: product.product_id,
      name: product.name,
      category: product.Category?.name ?? null,
      product_type: product.product_type,
      standard_delivery_days: product.standard_delivery_days,
      urgent_delivery_enabled: product.urgent_delivery_enabled,
      urgent_delivery_days: product.urgent_delivery_days,
      urgent_delivery_cost: product.urgent_delivery_cost,
      variant_count: Number(product.get('variant_count') || 0),
      min_price: Number(product.get('min_price') || 0),
      max_price: Number(product.get('max_price') || 0),
      total_stock: Number(product.get('total_stock') || 0),
      created_at: product.created_at,
      updated_at: product.updated_at,
      image_url: (await ProductVariant.findOne({
        where: { product_id: product.product_id, is_deleted: false },
        include: [{ model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false }],
        order: [['variant_id', 'ASC']]
      }))?.ProductImages?.[0]?.image_url ?? null,
      collaborator: product.Collaborator?.name ?? null
    })));

    res.status(200).json({ message: 'Productos obtenidos exitosamente', products: formattedProducts, total: count.length, page: pageNum, pageSize: pageSizeNum });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(error.message.includes('no encontrada') ? 404 : 400).json({ message: 'Error al obtener los productos', error: error.message });
  }
};

// Eliminar lógicamente un producto
exports.deleteProduct = async (req, res) => {
  const { product_id } = req.params;
  const userId = req.user?.user_id ?? 'system';

  try {
    const product = await Product.findByPk(product_id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    if (product.status === 'inactive') return res.status(400).json({ message: 'El producto ya está inactivo' });

    await product.update({ status: 'inactive' });
    await ProductVariant.update({ is_deleted: true }, { where: { product_id } });

    loggerUtils.logUserActivity(userId, 'delete', `Producto eliminado lógicamente: ${product.name} (${product_id})`);
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
        { model: ProductVariant, where: { is_deleted: false }, include: [
          { model: ProductAttributeValue, include: [{ model: ProductAttribute, attributes: ['attribute_id', 'attribute_name', 'data_type', 'allowed_values'] }] },
          { model: ProductImage, attributes: ['image_id', 'image_url', 'public_id', 'order'] }
        ]},
        { model: CustomizationOption, attributes: ['option_type', 'description'] }
      ]
    });

    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });
    res.status(200).json({ message: 'Producto obtenido exitosamente', product: formatProductResponse(product) });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el producto', error: error.message });
  }
};

// Actualizar un producto
exports.updateProduct = async (req, res) => {
  const { product_id } = req.params;
  const { name, description, product_type, category_id, collaborator_id, variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost } = req.body;
  const files = req.files;
  const userId = req.user?.user_id ?? 'system';

  try {
    const product = await Product.findByPk(product_id, { include: [{ model: ProductVariant, include: [ProductImage] }, { model: CustomizationOption }] });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    const { parsedVariants, parsedCustomizations } = parseUpdateInput(variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost);
    await updateProductBase(product, { name, description, product_type, category_id, collaborator_id, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost });
    await updateCustomizations(product.product_id, parsedCustomizations);

    if (parsedVariants) {
      const existingVariants = Object.fromEntries(product.ProductVariants.map(v => [v.variant_id, v]));
      const priceHistoryRecords = [];
      for (const [index, variant] of parsedVariants.entries()) {
        priceHistoryRecords.push(...await updateOrCreateVariant(product.product_id, variant, existingVariants, files, index, userId));
      }
      if (priceHistoryRecords.length > 0) await PriceHistory.bulkCreate(priceHistoryRecords);
    }

    const updatedProduct = await Product.findByPk(product_id, {
      include: [
        { model: ProductVariant, include: [ProductImage, { model: ProductAttributeValue, include: [ProductAttribute] }] },
        { model: CustomizationOption },
        { model: Category },
        { model: Collaborator }
      ]
    });
    loggerUtils.logUserActivity(userId, 'update', `Producto actualizado: ${product.name} (${product_id})`);
    res.status(200).json({ message: 'Producto actualizado exitosamente', product: formatProductResponse(updatedProduct) });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(error.message.includes('no encontrada') ? 404 : 400).json({ message: 'Error al actualizar el producto', error: error.message });
  }
};

// Eliminar lógicamente múltiples variantes
exports.deleteVariant = async (req, res) => {
  const { product_id } = req.params;
  const { variant_ids } = req.body;
  const userId = req.user?.user_id ?? 'system';

  try {
    const product = await Product.findByPk(product_id);
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    const variants = await ProductVariant.findAll({ where: { variant_id: { [Op.in]: variant_ids }, product_id }, include: [ProductImage] });
    if (variants.length === 0) return res.status(404).json({ message: 'Ninguna variante encontrada' });

    if (variants.length !== variant_ids.length) {
      const notFoundIds = variant_ids.filter(id => !variants.some(v => v.variant_id === id));
      loggerUtils.logWarning(`Variantes no encontradas: ${notFoundIds.join(', ')}`);
    }

    await Promise.all(variants.map(async variant => {
      const sortedImages = variant.ProductImages.sort((a, b) => a.order - b.order);
      if (sortedImages.length > 1) {
        await Promise.all(sortedImages.slice(1).map(async image => {
          await deleteFromCloudinary(image.public_id);
          await image.destroy();
        }));
      }
      await variant.update({ is_deleted: true });
      loggerUtils.logUserActivity(userId, 'delete', `Variante ${variant.sku} eliminada lógicamente del producto ${product_id}`);
    }));

    res.status(200).json({ message: 'Variantes eliminadas exitosamente', deletedCount: variants.length });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar las variantes', error: error.message });
  }
};