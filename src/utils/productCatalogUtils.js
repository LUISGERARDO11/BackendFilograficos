const { Op } = require('sequelize');
const { ProductVariant, ProductImage, Category, Collaborator, PriceHistory } = require('../models/Associations');
const { uploadProductImagesToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');
const loggerUtils = require('./loggerUtils');

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
  return {
    variant_id,
    previous_production_cost: oldData.production_cost || 0,
    new_production_cost: newData.production_cost,
    previous_profit_margin: oldData.profit_margin || 0,
    new_profit_margin: newData.profit_margin,
    previous_calculated_price: oldData.calculated_price || 0,
    new_calculated_price: newData.calculated_price,
    change_type,
    changed_by: userId,
    change_date: new Date()
  };
}

// Validar SKU único
async function validateUniqueSku(sku, variant_id = null) {
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
    variants: product.ProductVariants?.map(variant => ({
      variant_id: variant.variant_id,
      sku: variant.sku,
      production_cost: variant.production_cost,
      profit_margin: variant.profit_margin,
      calculated_price: variant.calculated_price,
      stock: variant.stock,
      stock_threshold: variant.stock_threshold,
      attributes: variant.ProductAttributeValues?.map(attr => ({
        attribute_id: attr.ProductAttribute.attribute_id,
        attribute_name: attr.ProductAttribute.attribute_name,
        value: attr.value,
        data_type: attr.ProductAttribute.data_type,
        allowed_values: attr.ProductAttribute.allowed_values
      })) || [],
      images: variant.ProductImages?.map(img => ({
        image_id: img.image_id,
        image_url: img.image_url,
        public_id: img.public_id,
        order: img.order
      })) || []
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

module.exports = {
  validateCategory,
  validateCollaborator,
  processVariantImages,
  createPriceHistoryRecord,
  validateUniqueSku,
  formatProductResponse,
  buildSearchFilters
};