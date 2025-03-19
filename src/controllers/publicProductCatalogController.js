// publicProductCatalogController.js

const { Product, ProductVariant, Category, Collaborator,ProductAttributeValue, ProductAttribute, ProductImage, CustomizationOption } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

exports.getAllProducts = async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const pageSize = parseInt(req.query.pageSize, 10) || 10;
        const { sort, categoryId, search, minPrice, maxPrice, collaboratorId } = req.query;

        console.log('Filtros recibidos:', { sort, categoryId, search, minPrice, maxPrice, collaboratorId });

        if (page < 1 || pageSize < 1) {
            return res.status(400).json({ message: 'Parámetros de paginación inválidos' });
        }

        const offset = (page - 1) * pageSize;

        let order = [['product_id', 'ASC']];
        if (sort) {
            const sortParams = sort.split(',').map(param => param.trim().split(':'));
            const validColumns = ['name', 'product_id', 'min_price', 'max_price', 'total_stock'];
            const validDirections = ['ASC', 'DESC'];
            order = sortParams.map(([column, direction]) => {
                if (!validColumns.includes(column)) {
                    throw new Error(`Columna de ordenamiento inválida: ${column}`);
                }
                if (!direction || !validDirections.includes(direction.toUpperCase())) {
                    throw new Error(`Dirección de ordenamiento inválida: ${direction}`);
                }
                return [column, direction.toUpperCase()];
            });
        }

        const whereClause = { status: 'active' };
        const variantWhereClause = {};

        if (categoryId) {
            whereClause.category_id = parseInt(categoryId, 10);
        }
        if (search) {
            whereClause.name = { [Op.iLike]: `%${search}%` };
        }
        if (minPrice) {
            variantWhereClause.calculated_price = { [Op.gte]: parseFloat(minPrice) };
        }
        if (maxPrice) {
            variantWhereClause.calculated_price = variantWhereClause.calculated_price || {};
            variantWhereClause.calculated_price[Op.lte] = parseFloat(maxPrice);
        }
        if (collaboratorId) {
            whereClause.collaborator_id = parseInt(collaboratorId, 10); 
        }

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
                {
                  model: ProductVariant,
                  attributes: [],
                  where: variantWhereClause,
                  required: true // Solo productos con variantes que cumplan el filtro
                },
                {
                  model: Collaborator,
                  attributes: ['collaborator_id', 'name'], // Incluimos el nombre del colaborador
                  required: false // No requerido, para que funcione incluso si no hay colaborador
                }
              ],
            group: ['Product.product_id', 'Product.name', 'Product.product_type', 'Category.category_id', 'Category.name','Collaborator.collaborator_id','Collaborator.name'],
            order,
            limit: pageSize,
            offset: offset,
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
                min_price: parseFloat(product.get('min_price')) || 0,
                max_price: parseFloat(product.get('max_price')) || 0,
                total_stock: parseInt(product.get('total_stock')) || 0,
                image_url: firstVariant && firstVariant.ProductImages.length > 0 ? firstVariant.ProductImages[0].image_url : null,
                collaborator: product.Collaborator ? { id: product.Collaborator.collaborator_id, name: product.Collaborator.name } : null 
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