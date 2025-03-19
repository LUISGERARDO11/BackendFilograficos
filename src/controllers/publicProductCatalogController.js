// publicProductCatalogController.js

const { Product, ProductVariant, Category, ProductAttributeValue, ProductAttribute, ProductImage, CustomizationOption } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

exports.getAllProducts = async (req, res) => {
    try {
      const { page = 1, pageSize = 10, categoryId, priceMin, priceMax, search } = req.query;
      const offset = (page - 1) * pageSize;
      const limit = parseInt(pageSize);
  
      // Construir las condiciones de búsqueda
      const where = { status: 'active' };
      const variantWhere = {};
  
      // Filtro por categoría
      if (categoryId) {
        where.category_id = categoryId;
      }
  
      // Filtro por rango de precios
      if (priceMin || priceMax) {
        variantWhere.calculated_price = {};
        if (priceMin) {
          variantWhere.calculated_price[Op.gte] = parseFloat(priceMin);
        }
        if (priceMax) {
          variantWhere.calculated_price[Op.lte] = parseFloat(priceMax);
        }
      }
  
      // Búsqueda por nombre
      if (search) {
        where.name = { [Op.like]: `%${search}%` };
      }
  
      const { count, rows } = await Product.findAndCountAll({
        where,
        offset,
        limit,
        include: [
          { model: Category, attributes: ['category_id', 'name'] },
          {
            model: ProductVariant,
            where: variantWhere,
            required: true,
            attributes: [['calculated_price', 'min_price'], ['calculated_price', 'max_price'], ['stock', 'total_stock']],
            include: [{ model: ProductImage, attributes: ['image_url'], limit: 1 }]
          }
        ],
        group: ['Product.product_id', 'Category.category_id']
      });
  
      const formattedProducts = rows.map(product => ({
        product_id: product.product_id,
        name: product.name,
        category: product.Category ? { category_id: product.Category.category_id, name: product.Category.name } : null,
        min_price: product.ProductVariants[0]?.min_price,
        max_price: product.ProductVariants[0]?.max_price,
        total_stock: product.ProductVariants.reduce((sum, variant) => sum + (variant.total_stock || 0), 0),
        image_url: product.ProductVariants[0]?.ProductImages[0]?.image_url
      }));
  
      res.status(200).json({
        message: 'Productos obtenidos exitosamente',
        products: formattedProducts,
        total: count.length,
        page: parseInt(page),
        pageSize: parseInt(pageSize)
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener productos', error: error.message });
    }
  };
exports.getProductById = async (req, res) => {
    try {
        const { product_id } = req.params;
        const product = await Product.findByPk(product_id, {
            where: { status: 'active' },
            include: [
                { model: Category, attributes: ['category_id', 'name'] },
                {
                    model: ProductVariant,
                    include: [
                        { model: ProductAttributeValue, include: [{ model: ProductAttribute, attributes: ['attribute_name', 'data_type', 'allowed_values'] }] },
                        { model: ProductImage, attributes: ['image_url', 'order'] }
                    ]
                },
                { model: CustomizationOption, attributes: ['option_type', 'description'] }
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
            variants: product.ProductVariants.map(variant => ({
                variant_id: variant.variant_id,
                sku: variant.sku,
                calculated_price: variant.calculated_price,
                stock: variant.stock,
                attributes: variant.ProductAttributeValues.map(attr => ({
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
                type: cust.option_type,
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