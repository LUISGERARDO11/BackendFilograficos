// publicProductCatalogController.js

const { Product, ProductVariant, Category, ProductAttributeValue, ProductAttribute, ProductImage, CustomizationOption } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

exports.getAllProducts = async (req, res) => {
    try {
      const products = await Product.findAll({
        where: { status: 'active' },
        attributes: ['product_id', 'name', 'product_type']
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
          product_type: product.product_type,
          image_url: firstVariant && firstVariant.ProductImages.length > 0 ? firstVariant.ProductImages[0].image_url : null
        };
      }));
  
      res.status(200).json({
        message: 'Productos obtenidos exitosamente',
        products: formattedProducts
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({ message: 'Error al obtener los productos', error: error.message });
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
          where: { status: 'active' },
          include: [
            { model: ProductAttributeValue, include: [{ model: ProductAttribute, attributes: ['attribute_name', 'data_type', 'allowed_values'] }] },
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