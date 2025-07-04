const { Op } = require('sequelize');
const { Product, ProductVariant, ProductImage, Category, Collaborator, PriceHistory, ProductAttribute, ProductAttributeValue, CustomizationOption } = require('../models/Associations');
const { uploadProductImagesToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const loggerUtils = require('./loggerUtils');
const moment = require('moment-timezone');

// Validar categoría
async function validateCategory(category_id) {
  const categoryIdNum = Number(category_id);
  const category = await Category.findByPk(categoryIdNum);
  if (!category) throw new Error('Categoría no encontrada');
  return categoryIdNum;
}

// Validar colaborador
async function validateCollaborator(collaborator_id) {
  if (!collaborator_id) return null;
  const collaborator = await Collaborator.findByPk(Number(collaborator_id));
  if (!collaborator) throw new Error('Colaborador no encontrado');
  return Number(collaborator_id);
}

// Procesar imágenes de variantes
async function processVariantImages(variant, files, index, sku, currentImages = []) {
  const variantImages = files?.filter(file => file.fieldname === `variants[${index}][images]`) || [];
  if (variantImages.length < 1 && currentImages.length === 0) {
    throw new Error(`La variante ${sku} debe tener al menos 1 imagen`);
  }
  if (variantImages.length + currentImages.length > 10) {
    throw new Error(`La variante ${sku} no puede tener más de 10 imágenes`);
  }

  const imageRecords = await Promise.all(
    variantImages.map(async (image, idx) => {
      const imageData = await uploadProductImagesToCloudinary(image.buffer, `${sku}-${currentImages.length + idx + 1}-${image.originalname}`);
      return {
        variant_id: variant.variant_id,
        image_url: imageData.secure_url,
        public_id: imageData.public_id,
        order: currentImages.length + idx + 1
      };
    })
  );
  return imageRecords;
}

// Crear registro de historial de precios
function createPriceHistoryRecord(variant_id, oldData, newData, change_type, userId) {
  const newCalculatedPrice = newData.calculated_price !== undefined 
    ? Number(newData.calculated_price)
    : Number((newData.production_cost * (1 + newData.profit_margin / 100)).toFixed(2));

  return {
    variant_id,
    previous_production_cost: oldData.production_cost || 0,
    previous_profit_margin: oldData.profit_margin || 0,
    previous_calculated_price: oldData.calculated_price || 0,
    new_production_cost: Number(newData.production_cost),
    new_profit_margin: Number(newData.profit_margin),
    new_calculated_price: newCalculatedPrice,
    change_type,
    changed_by: userId,
    change_date: moment().tz('UTC').toDate(), // Almacenar en UTC
    change_description: change_type === 'initial' ? 'Precio inicial establecido al crear la variante' : null
  };
}

// Validar SKU único y formato
async function validateUniqueSku(sku, variant_id = null) {
  const skuRegex = /^[A-Z]{4}-[0-9]{6}-[0-9]{2}$/;
  if (!skuRegex.test(sku)) {
    throw new Error(`El SKU ${sku} no cumple con el formato requerido: AAAA-NNNNNN-NN`);
  }

  const existingVariant = await ProductVariant.findOne({ where: { sku } });
  if (existingVariant && existingVariant.variant_id !== variant_id) {
    throw new Error(`El SKU ${sku} ya existe`);
  }
}

// Formatear respuesta de producto
function formatProductResponse(product) {
  return {
    product_id: product.product_id,
    name: product.name,
    description: product.description,
    product_type: product.product_type,
    category: product.Category ? { category_id: product.Category.category_id, name: product.Category.name } : null,
    collaborator: product.Collaborator ? { collaborator_id: product.Collaborator.collaborator_id, name: product.Collaborator.name } : null,
    status: product.status,
    standard_delivery_days: product.standard_delivery_days,
    urgent_delivery_enabled: product.urgent_delivery_enabled,
    urgent_delivery_days: product.urgent_delivery_days,
    urgent_delivery_cost: product.urgent_delivery_cost,
    variants: product.ProductVariants?.map(variant => ({
      variant_id: variant.variant_id,
      sku: variant.sku,
      production_cost: variant.production_cost,
      profit_margin: variant.profit_margin,
      calculated_price: variant.calculated_price,
      stock: variant.stock,
      stock_threshold: variant.stock_threshold,
      attributes: variant.ProductAttributeValues?.map(attr => ({
        attribute_id: attr.ProductAttribute?.attribute_id || null,
        attribute_name: attr.ProductAttribute?.attribute_name || 'Desconocido',
        value: attr.value,
        data_type: attr.ProductAttribute?.data_type || 'texto',
        allowed_values: attr.ProductAttribute?.allowed_values || null
      })) || [],
      images: variant.ProductImages?.map(img => ({
        image_id: img.image_id,
        image_url: img.image_url,
        public_id: img.public_id,
        order: img.order
      })) || [],
      updated_at: moment(variant.updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss') // Presentar en America/Mexico_City
    })) || [],
    customizations: product.CustomizationOptions?.map(cust => ({
      type: cust.option_type,
      description: cust.description
    })) || []
  };
}

// Construir filtros de búsqueda
function buildSearchFilters(search) {
  const where = { status: 'active' };
  if (!search) return where;

  where[Op.or] = [
    { name: { [Op.like]: `%${search}%` } },
    { '$Category.name$': { [Op.like]: `%${search}%` } }
  ];
  const numSearch = Number(search);
  if (!isNaN(numSearch)) {
    where[Op.or].push(
      { '$ProductVariants.calculated_price$': { [Op.between]: [numSearch - 0.01, numSearch + 0.01] } },
      { '$ProductVariants.stock$': numSearch }
    );
  }
  return where;
}

// Analizar y validar entrada para createProduct
function parseAndValidateInput(variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost) {
  const parsedInput = {};

  // Parsear valores de FormData o JSON a los tipos correctos
  parsedInput.standard_delivery_days = parseInt(standard_delivery_days, 10);
  parsedInput.urgent_delivery_enabled = urgent_delivery_enabled === 'true' || urgent_delivery_enabled === true;
  parsedInput.urgent_delivery_days = urgent_delivery_enabled && urgent_delivery_days ? parseInt(urgent_delivery_days, 10) : undefined;
  parsedInput.urgent_delivery_cost = urgent_delivery_enabled && urgent_delivery_cost ? parseFloat(urgent_delivery_cost) : undefined;

  // Validar campos de entrega
  if (!Number.isInteger(parsedInput.standard_delivery_days) || parsedInput.standard_delivery_days < 1) {
    throw new Error('Los días de entrega estándar deben ser un número mayor o igual a 1');
  }
  if (typeof parsedInput.urgent_delivery_enabled !== 'boolean') {
    throw new Error('La entrega urgente habilitada debe ser un booleano');
  }
  if (parsedInput.urgent_delivery_enabled) {
    if (!Number.isInteger(parsedInput.urgent_delivery_days) || parsedInput.urgent_delivery_days < 1 || parsedInput.urgent_delivery_days >= parsedInput.standard_delivery_days) {
      throw new Error('Los días de entrega urgente deben ser un número mayor a 0 y menor que los días estándar');
    }
    if (typeof parsedInput.urgent_delivery_cost !== 'number' || parsedInput.urgent_delivery_cost < 0) {
      throw new Error('El costo de entrega urgente debe ser un número no negativo');
    }
  }

  let parsedVariants = null;
  if (variants) {
    try {
      parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      if (!Array.isArray(parsedVariants)) {
        throw new Error('Las variantes deben ser un arreglo');
      }
      parsedVariants = parsedVariants.map(variant => ({
        sku: variant.sku,
        production_cost: parseFloat(variant.production_cost),
        profit_margin: parseFloat(variant.profit_margin),
        stock: parseInt(variant.stock, 10),
        stock_threshold: variant.stock_threshold ? parseInt(variant.stock_threshold, 10) : undefined,
        attributes: variant.attributes ? variant.attributes.map(attr => ({
          attribute_id: parseInt(attr.attribute_id, 10),
          value: attr.value
        })) : [],
        customizations: variant.customizations
      }));
    } catch (error) {
      throw new Error(`Error al parsear variants: ${error.message}`);
    }
  }

  let parsedCustomizations = null;
  if (customizations) {
    try {
      parsedCustomizations = typeof customizations === 'string' ? JSON.parse(customizations) : customizations;
      if (!Array.isArray(parsedCustomizations)) {
        throw new Error('Las personalizaciones deben ser un arreglo');
      }
    } catch (error) {
      throw new Error(`Error al parsear customizations: ${error.message}`);
    }
  }

  return { parsedVariants, parsedCustomizations };
}

// Crear base del producto
async function createProductBase(name, description, product_type, category_id, collaborator_id, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost) {
  const categoryIdNum = await validateCategory(category_id);
  const collaboratorIdNum = await validateCollaborator(collaborator_id);
  return Product.create({
    name,
    description: description ?? null,
    product_type,
    category_id: categoryIdNum,
    collaborator_id: collaboratorIdNum,
    status: 'active',
    standard_delivery_days,
    urgent_delivery_enabled,
    urgent_delivery_days: urgent_delivery_enabled ? urgent_delivery_days : null,
    urgent_delivery_cost: urgent_delivery_enabled ? urgent_delivery_cost : null
  });
}

// Crear opciones de personalización
function createCustomizationOptions(product_id, product_type, customizations) {
  if (product_type !== 'Existencia' && Array.isArray(customizations) && customizations.length > 0) {
    return customizations.map(cust => ({
      product_id,
      option_type: cust.type.toLowerCase(),
      description: cust.description
    }));
  }
  return [];
}

// Procesar atributos de variantes
async function processVariantAttributes(variant_id, attributes, categoryIdNum) {
  if (!Array.isArray(attributes) || attributes.length === 0) return [];
  
  const validAttributes = await ProductAttribute.findAll({
    include: [{ model: Category, where: { category_id: categoryIdNum }, through: { attributes: [] } }],
    where: { is_deleted: false }
  });
  const validAttributeIds = validAttributes.map(attr => attr.attribute_id);
  const attributeRecords = [];

  for (const attr of attributes) {
    const attributeIdNum = Number(attr.attribute_id);
    if (!validAttributeIds.includes(attributeIdNum)) {
      throw new Error(`El atributo con ID ${attributeIdNum} no pertenece a esta categoría`);
    }
    const attribute = validAttributes.find(a => a.attribute_id === attributeIdNum);
    
    if (attr.value === '') {
      attributeRecords.push({ variant_id, attribute_id: attributeIdNum, value: '' });
      continue;
    }

    if (attribute.data_type === 'lista' && attribute.allowed_values) {
      const allowedValues = attribute.allowed_values.split(',');
      if (!allowedValues.includes(attr.value)) {
        throw new Error(`El valor "${attr.value}" no es permitido para el atributo "${attribute.attribute_name}"`);
      }
    } else if (attribute.data_type === 'numero') {
      if (isNaN(Number(attr.value))) {
        throw new Error(`El valor "${attr.value}" no es un número válido para el atributo "${attribute.attribute_name}"`);
      }
    } else if (attribute.data_type === 'boolean') {
      if (attr.value !== 'true' && attr.value !== 'false') {
        throw new Error(`El valor "${attr.value}" no es un booleano válido para el atributo "${attribute.attribute_name}"`);
      }
    }

    attributeRecords.push({ variant_id, attribute_id: attributeIdNum, value: attr.value });
  }
  return attributeRecords;
}

// Analizar entrada para updateProduct
function parseUpdateInput(variants, customizations, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost) {
  let parsedVariants = null;
  if (variants) {
    if (typeof variants === 'string') {
      parsedVariants = JSON.parse(variants);
    } else {
      parsedVariants = variants;
    }
    if (!Array.isArray(parsedVariants)) throw new Error('Las variantes deben ser un arreglo');
  }

  let parsedCustomizations = null;
  if (customizations) {
    if (typeof customizations === 'string') {
      parsedCustomizations = JSON.parse(customizations);
    } else {
      parsedCustomizations = customizations;
    }
    if (!Array.isArray(parsedCustomizations)) throw new Error('Las personalizaciones deben ser un arreglo');
  }

  // Validar campos de entrega
  if (standard_delivery_days !== undefined) {
    const parsedStandardDeliveryDays = parseInt(standard_delivery_days, 10);
    if (!Number.isInteger(parsedStandardDeliveryDays) || parsedStandardDeliveryDays < 1) {
      throw new Error('Los días de entrega estándar deben ser un número mayor o igual a 1');
    }
  }
  if (urgent_delivery_enabled !== undefined) {
    const parsedUrgentDeliveryEnabled = urgent_delivery_enabled === 'true' || urgent_delivery_enabled === true;
    if (typeof parsedUrgentDeliveryEnabled !== 'boolean') {
      throw new Error('La entrega urgente habilitada debe ser un booleano');
    }
    if (parsedUrgentDeliveryEnabled) {
      const parsedUrgentDeliveryDays = parseInt(urgent_delivery_days, 10);
      if (!Number.isInteger(parsedUrgentDeliveryDays) || parsedUrgentDeliveryDays < 1 || parsedUrgentDeliveryDays >= (parseInt(standard_delivery_days, 10) || 1)) {
        throw new Error('Los días de entrega urgente deben ser un número mayor a 0 y menor que los días estándar');
      }
      const parsedUrgentDeliveryCost = parseFloat(urgent_delivery_cost);
      if (typeof parsedUrgentDeliveryCost !== 'number' || parsedUrgentDeliveryCost < 0) {
        throw new Error('El costo de entrega urgente debe ser un número no negativo');
      }
    }
  }

  return { parsedVariants, parsedCustomizations };
}

// Actualizar detalles básicos del producto
async function updateProductBase(product, { name, description, product_type, category_id, collaborator_id, standard_delivery_days, urgent_delivery_enabled, urgent_delivery_days, urgent_delivery_cost }) {
  const newCategoryId = category_id ? await validateCategory(category_id) : product.category_id;
  
  let newCollaboratorId;
  if (collaborator_id === undefined) {
    newCollaboratorId = product.collaborator_id;
  } else if (collaborator_id === 'null' || collaborator_id === null) {
    newCollaboratorId = null;
  } else {
    newCollaboratorId = await validateCollaborator(collaborator_id);
  }

  await product.update({
    name: name ?? product.name,
    description: description ?? product.description,
    product_type: product_type ?? product.product_type,
    category_id: newCategoryId,
    collaborator_id: newCollaboratorId,
    standard_delivery_days: standard_delivery_days ?? product.standard_delivery_days,
    urgent_delivery_enabled: urgent_delivery_enabled ?? product.urgent_delivery_enabled,
    urgent_delivery_days: urgent_delivery_enabled ? urgent_delivery_days : null,
    urgent_delivery_cost: urgent_delivery_enabled ? urgent_delivery_cost : null
  });
}

// Actualizar personalizaciones
async function updateCustomizations(product_id, customizations) {
  if (!customizations) return;
  await CustomizationOption.destroy({ where: { product_id } });
  const newCustomizations = customizations.map(cust => ({
    product_id,
    option_type: cust.type.toLowerCase(),
    description: cust.description
  }));
  if (newCustomizations.length > 0) await CustomizationOption.bulkCreate(newCustomizations);
}

// Helper: Actualizar variante existente
async function updateExistingVariant(variant, existingVariants, files, index, userId) {
  const existingVariant = existingVariants[variant.variant_id];
  if (!existingVariant) throw new Error(`Variante ${variant.variant_id} no encontrada`);

  const newProductionCost = variant.production_cost !== undefined ? Number(variant.production_cost) : existingVariant.production_cost;
  const newProfitMargin = variant.profit_margin !== undefined ? Number(variant.profit_margin) : existingVariant.profit_margin;
  const newCalculatedPrice = Number((newProductionCost * (1 + newProfitMargin / 100)).toFixed(2));

  const priceHistoryRecords = [];
  if (newProductionCost !== existingVariant.production_cost || newProfitMargin !== existingVariant.profit_margin) {
    priceHistoryRecords.push(createPriceHistoryRecord(existingVariant.variant_id, existingVariant, {
      production_cost: newProductionCost,
      profit_margin: newProfitMargin,
      calculated_price: newCalculatedPrice
    }, 'manual', userId));
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

  return priceHistoryRecords;
}

// Helper: Crear nueva variante
async function createNewVariant(product_id, variant, files, index, userId) {
  await validateUniqueSku(variant.sku);
  const calculated_price = Number((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));
  const newVariant = await ProductVariant.create({
    product_id,
    sku: variant.sku,
    production_cost: variant.production_cost,
    profit_margin: variant.profit_margin,
    calculated_price,
    stock_threshold: variant.stock_threshold ?? 10
  });

  const priceHistoryRecords = [createPriceHistoryRecord(newVariant.variant_id, {}, variant, 'initial', userId)];
  const newImages = await processVariantImages(newVariant, files, index, variant.sku);
  await ProductImage.bulkCreate(newImages);

  return priceHistoryRecords;
}

// Actualizar o crear variante
async function updateOrCreateVariant(product_id, variant, existingVariants, files, index, userId) {
  if (variant.variant_id) {
    return await updateExistingVariant(variant, existingVariants, files, index, userId);
  }
  return await createNewVariant(product_id, variant, files, index, userId);
}

// Procesar variantes para createProduct
async function processVariants(product_id, variants, files, categoryIdNum, userId) {
  const variantRecords = [];
  const attributeRecords = [];
  const imageRecords = [];
  const priceHistoryRecords = [];

  for (const [index, variant] of variants.entries()) {
    const sku = variant.sku;
    await validateUniqueSku(sku);

    const calculated_price = Number((variant.production_cost * (1 + variant.profit_margin / 100)).toFixed(2));
    const newVariant = await ProductVariant.create({
      product_id,
      sku,
      production_cost: variant.production_cost,
      profit_margin: variant.profit_margin,
      calculated_price,
      stock: variant.stock,
      stock_threshold: variant.stock_threshold ?? 10
    });

    variantRecords.push(newVariant);
    priceHistoryRecords.push(createPriceHistoryRecord(newVariant.variant_id, {}, {
      production_cost: variant.production_cost,
      profit_margin: variant.profit_margin,
      calculated_price
    }, 'initial', userId));
    imageRecords.push(...await processVariantImages(newVariant, files, index, sku));
    attributeRecords.push(...await processVariantAttributes(newVariant.variant_id, variant.attributes, categoryIdNum));
  }

  return { variantRecords, attributeRecords, imageRecords, priceHistoryRecords };
}

module.exports = {
  validateCategory,
  validateCollaborator,
  processVariantImages,
  createPriceHistoryRecord,
  validateUniqueSku,
  formatProductResponse,
  buildSearchFilters,
  parseAndValidateInput,
  createProductBase,
  createCustomizationOptions,
  processVariantAttributes,
  parseUpdateInput,
  updateProductBase,
  updateCustomizations,
  updateOrCreateVariant,
  processVariants
};