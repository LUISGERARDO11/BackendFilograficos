// publicProductCatalogController.js

const { Product, ProductVariant, Category, ProductAttributeValue, ProductAttribute, ProductImage, CustomizationOption } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

exports.getAllProducts = async (req, res) => {
    try {
        const { page = 1, pageSize = 10, sort, categoryId, search, minPrice, maxPrice } = req.query;
        const offset = (page - 1) * pageSize;

        const order = sort ? sort.split(',').map(param => param.trim().split(':')) : [['product_id', 'ASC']];

        const whereClause = { status: 'active' };
        if (categoryId) whereClause.category_id = parseInt(categoryId, 10);
        if (search) whereClause.name = { [Op.iLike]: `%${search}%` };

        // Agregar filtros de precio usando `HAVING`
        const havingClause = {};
        if (minPrice) havingClause.min_price = { [Op.gte]: parseFloat(minPrice) };
        if (maxPrice) havingClause.max_price = { [Op.lte]: parseFloat(maxPrice) };

        const { count, rows: products } = await Product.findAndCountAll({
            where: whereClause,
            attributes: [
                'product_id',
                'name',
                'product_type',
                [Product.sequelize.fn('MIN', Product.sequelize.col('ProductVariants.calculated_price')), 'min_price'],
                [Product.sequelize.fn('MAX', Product.sequelize.col('ProductVariants.calculated_price')), 'max_price'],
                [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.stock')), 'total_stock']
            ],
            include: [
                { model: Category, attributes: ['category_id', 'name'] },
                { model: ProductVariant, attributes: [], required: false }
            ],
            group: ['Product.product_id', 'Product.name', 'Product.product_type', 'Category.category_id', 'Category.name'],
            having: havingClause,  // 🔥 Filtra después de agrupar
            order,
            limit: pageSize,
            offset,
            subQuery: false
        });

        res.status(200).json({
            message: 'Productos obtenidos exitosamente',
            products,
            total: count.length,
            page,
            pageSize
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