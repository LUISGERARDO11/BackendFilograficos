const { Op } = require('sequelize');
const { Product, ProductVariant, Category, Collaborator, ProductAttribute, ProductAttributeValue, CustomizationOption, ProductImage, PriceHistory } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { validateCategory, validateCollaborator, processVariantImages, createPriceHistoryRecord, validateUniqueSku, formatProductResponse, buildSearchFilters } = require('../utils/productCatalogUtils');
const { deleteFromCloudinary } = require('../services/cloudinaryService');

// Crear un producto con variantes
exports.createProduct = async (req, res) => {
  let { name, description, product_type, category_id, collaborator_id, variants, customizations } = req.body;
  const files = req.files;
  const userId = req.user?.user_id ?? 'system';

  try {
    variants = typeof variants === 'string' ? JSON.parse(variants) : variants;
    customizations = typeof customizations === 'string' ? JSON.parse(customizations) : customizations;

    if (!Array.isArray(variants)) throw new Error('Las variantes deben ser un arreglo');

    const categoryIdNum = await validateCategory(category_id);
    const collaboratorIdNum = await validateCollaborator(collaborator_id);

    const newProduct = await Product.create({
      name,
      description: description ?? null,
      product_type,
      category_id: categoryIdNum,
      collaborator_id: collaboratorIdNum,
      status: 'active'
    });

    const customizationRecords = product_type !== 'Existencia' && Array.isArray(customizations) && customizations.length > 0
      ? customizations.map(cust => ({
          product_id: newProduct.product_id,
          option_type: cust.type.toLowerCase(),
          description: cust.description
        }))
      : [];

    const variantRecords = [];
    const attributeRecords = [];
    const imageRecords = [];
    const priceHistoryRecords = [];

    for (const [index, variant] of variants.entries()) {
      await validateUniqueSku(variant.sku);
      const calculated_price = Number((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));
      const newVariant = await ProductVariant.create({
        product_id: newProduct.product_id,
        sku: variant.sku,
        production_cost: variant.production_cost,
        profit_margin: variant.profit_margin,
        calculated_price,
        stock: variant.stock,
        stock_threshold: variant.stock_threshold ?? 10
      });

      variantRecords.push(newVariant);
      priceHistoryRecords.push(createPriceHistoryRecord(newVariant.variant_id, {}, variant, 'initial', userId));
      imageRecords.push(...await processVariantImages(newVariant, files, index, variant.sku));

      if (Array.isArray(variant.attributes) && variant.attributes.length > 0) {
        const validAttributes = await ProductAttribute.findAll({
          include: [{ model: Category, where: { category_id: categoryIdNum }, through: { attributes: [] } }],
          where: { is_deleted: false }
        });
        const validAttributeIds = validAttributes.map(attr => attr.attribute_id);

        for (const attr of variant.attributes) {
          const attributeIdNum = Number(attr.attribute_id);
          if (!validAttributeIds.includes(attributeIdNum)) {
            throw new Error(`El atributo con ID ${attributeIdNum} no pertenece a esta categoría`);
          }
          const attribute = validAttributes.find(a => a.attribute_id === attributeIdNum);
          if (attribute.data_type === 'lista' && attribute.allowed_values && !attribute.allowed_values.split(',').includes(attr.value)) {
            throw new Error(`El valor "${attr.value}" no es permitido para el atributo "${attribute.attribute_name}"`);
          }
          attributeRecords.push({ variant_id: newVariant.variant_id, attribute_id: attributeIdNum, value: attr.value });
        }
      }
    }

    if (attributeRecords.length > 0) await ProductAttributeValue.bulkCreate(attributeRecords);
    if (customizationRecords.length > 0) await CustomizationOption.bulkCreate(customizationRecords);
    if (imageRecords.length > 0) await ProductImage.bulkCreate(imageRecords);
    if (priceHistoryRecords.length > 0) await PriceHistory.bulkCreate(priceHistoryRecords);

    const createdProduct = await Product.findByPk(newProduct.product_id, {
      include: [{ model: ProductVariant, include: [ProductImage, ProductAttributeValue] }, { model: CustomizationOption }]
    });

    loggerUtils.logUserActivity(userId, 'create', `Producto creado: ${name} (${newProduct.product_id})`);
    res.status(201).json({ message: 'Producto creado exitosamente', product: formatProductResponse(createdProduct) });
  } catch (error) {
    await Product.destroy({ where: { product_id: newProduct?.product_id } }); // Rollback básico
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
        'product_id', 'name', 'product_type', 'created_at', 'updated_at',
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
  let { name, description, product_type, category_id, collaborator_id, variants, customizations } = req.body;
  const files = req.files;
  const userId = req.user?.user_id ?? 'system';

  try {
    const product = await Product.findByPk(product_id, { include: [{ model: ProductVariant, include: [ProductImage] }, { model: CustomizationOption }] });
    if (!product) return res.status(404).json({ message: 'Producto no encontrado' });

    const newCategoryId = category_id ? await validateCategory(category_id) : product.category_id;
    const newCollaboratorId = collaborator_id !== undefined ? (collaborator_id === 'null' || collaborator_id === null ? null : await validateCollaborator(collaborator_id)) : product.collaborator_id;

    await product.update({
      name: name ?? product.name,
      description: description ?? product.description,
      product_type: product_type ?? product.product_type,
      category_id: newCategoryId,
      collaborator_id: newCollaboratorId
    });

    if (customizations) {
      customizations = typeof customizations === 'string' ? JSON.parse(customizations) : customizations;
      if (!Array.isArray(customizations)) throw new Error('Las personalizaciones deben ser un arreglo');
      await CustomizationOption.destroy({ where: { product_id: product.product_id } });
      const newCustomizations = customizations.map(cust => ({ product_id: product.product_id, option_type: cust.type.toLowerCase(), description: cust.description }));
      if (newCustomizations.length > 0) await CustomizationOption.bulkCreate(newCustomizations);
    }

    if (variants) {
      variants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      if (!Array.isArray(variants)) throw new Error('Las variantes deben ser un arreglo');

      const priceHistoryRecords = [];
      const existingVariants = Object.fromEntries(product.ProductVariants.map(v => [v.variant_id, v]));

      for (const [index, variant] of variants.entries()) {
        if (variant.variant_id) {
          const existingVariant = existingVariants[variant.variant_id];
          if (!existingVariant) throw new Error(`Variante ${variant.variant_id} no encontrada`);

          const newProductionCost = variant.production_cost !== undefined ? Number(variant.production_cost) : existingVariant.production_cost;
          const newProfitMargin = variant.profit_margin !== undefined ? Number(variant.profit_margin) : existingVariant.profit_margin;
          const newCalculatedPrice = Number((newProductionCost * (1 + newProfitMargin / 100)).toFixed(2));

          if (newProductionCost !== existingVariant.production_cost || newProfitMargin !== existingVariant.profit_margin) {
            priceHistoryRecords.push(createPriceHistoryRecord(existingVariant.variant_id, existingVariant, { production_cost: newProductionCost, profit_margin: newProfitMargin, calculated_price: newCalculatedPrice }, 'manual', userId));
          }

          await existingVariant.update({ production_cost: newProductionCost, profit_margin: newProfitMargin, calculated_price: newCalculatedPrice });

          if (Array.isArray(variant.imagesToDelete)) {
            for (const imageId of variant.imagesToDelete) {
              const image = await ProductImage.findByPk(imageId);
              if (image && image.variant_id === existingVariant.variant_id) {
                await deleteFromCloudinary(image.public_id);
                await image.destroy();
              }
            }
          }

          const currentImages = existingVariant.ProductImages.filter(img => !variant.imagesToDelete?.includes(img.image_id));
          const newImages = await processVariantImages(existingVariant, files, index, existingVariant.sku, currentImages);
          if (newImages.length > 0) await ProductImage.bulkCreate(newImages);
        } else {
          await validateUniqueSku(variant.sku);
          const calculated_price = Number((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));
          const newVariant = await ProductVariant.create({
            product_id: product.product_id,
            sku: variant.sku,
            production_cost: variant.production_cost,
            profit_margin: variant.profit_margin,
            calculated_price,
            stock_threshold: variant.stock_threshold ?? 10
          });

          priceHistoryRecords.push(createPriceHistoryRecord(newVariant.variant_id, {}, variant, 'initial', userId));
          const newImages = await processVariantImages(newVariant, files, index, variant.sku);
          await ProductImage.bulkCreate(newImages);
        }
      }

      if (priceHistoryRecords.length > 0) await PriceHistory.bulkCreate(priceHistoryRecords);
    }

    const updatedProduct = await Product.findByPk(product_id, { include: [{ model: ProductVariant, include: [ProductImage] }, { model: CustomizationOption }] });
    loggerUtils.logUserActivity(userId, 'update', `Producto actualizado: ${product.name} (${product_id})`);
    res.status(200).json({ message: 'Producto actualizado exitosamente', product: updatedProduct });
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