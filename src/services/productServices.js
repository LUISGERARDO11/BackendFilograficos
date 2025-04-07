/* The above code is a JavaScript module that exports several functions related to querying and
formatting product data from a database using Sequelize ORM. Here is a summary of the functions
provided: */
const { Product, ProductVariant, Category, Collaborator, ProductAttributeValue, ProductAttribute, ProductImage, CustomizationOption, PriceHistory } = require('../models/Associations');
const { Op } = require('sequelize');

const getProductsWithFilters = async ({ page, pageSize, sort, categoryId, search, minPrice, maxPrice, collaboratorId, includeCollaborator = false }) => {
    const offset = (page - 1) * pageSize;

    let order = [['product_id', 'ASC']];
    if (sort) {
        const sortParams = sort.split(',').map(param => param.trim().split(':'));
        const validColumns = ['name', 'product_id', 'min_price', 'max_price', 'total_stock'];
        const validDirections = ['ASC', 'DESC'];
        order = sortParams.map(([column, direction]) => {
            if (!validColumns.includes(column)) throw new Error(`Columna de ordenamiento inválida: ${column}`);
            if (!direction || !validDirections.includes(direction.toUpperCase())) throw new Error(`Dirección de ordenamiento inválida: ${direction}`);
            return [column, direction.toUpperCase()];
        });
    }

    const whereClause = { status: 'active' };
    const variantWhereClause = {};
    if (categoryId) whereClause.category_id = parseInt(categoryId, 10);
    if (search) whereClause.name = { [Op.iLike]: `%${search}%` };
    if (minPrice) variantWhereClause.calculated_price = { [Op.gte]: parseFloat(minPrice) };
    if (maxPrice) variantWhereClause.calculated_price = { ...variantWhereClause.calculated_price, [Op.lte]: parseFloat(maxPrice) };
    if (collaboratorId) whereClause.collaborator_id = parseInt(collaboratorId, 10);

    const include = [
        { model: Category, attributes: ['category_id', 'name'] },
        { model: ProductVariant, attributes: [], where: variantWhereClause, required: true },
    ];
    if (includeCollaborator) {
        include.push({ model: Collaborator, attributes: ['collaborator_id', 'name'], required: false });
    }

    const { count, rows: products } = await Product.findAndCountAll({
        where: whereClause,
        attributes: [
            'product_id', 'name', 'product_type',
            [Product.sequelize.fn('MIN', Product.sequelize.col('ProductVariants.calculated_price')), 'min_price'],
            [Product.sequelize.fn('MAX', Product.sequelize.col('ProductVariants.calculated_price')), 'max_price'],
            [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.stock')), 'total_stock'],
            [Product.sequelize.fn('COUNT', Product.sequelize.col('ProductVariants.variant_id')), 'variantCount'],
        ],
        include,
        group: ['Product.product_id', 'Product.name', 'Product.product_type', 'Category.category_id', 'Category.name']
            .concat(includeCollaborator ? ['Collaborator.collaborator_id', 'Collaborator.name'] : []),
        having: Product.sequelize.literal('SUM("ProductVariants"."stock") > 0'),
        order,
        limit: pageSize,
        offset,
        subQuery: false,
    });

    return { count, products };
};

const formatProductList = async (products) => {
    return Promise.all(products.map(async (product) => {
        const firstVariant = await ProductVariant.findOne({
            where: { product_id: product.product_id },
            include: [{ model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false }],
            order: [['variant_id', 'ASC']],
        });

        return {
            product_id: product.product_id,
            name: product.name,
            category: product.Category ? product.Category.name : null,
            product_type: product.product_type,
            min_price: parseFloat(product.get('min_price')) || 0,
            max_price: parseFloat(product.get('max_price')) || 0,
            total_stock: parseInt(product.get('total_stock')) || 0,
            variant_count: parseInt(product.get('variantCount')) || 0,
            image_url: firstVariant && firstVariant.ProductImages.length > 0 ? firstVariant.ProductImages[0].image_url : null,
            collaborator: product.Collaborator ? { id: product.Collaborator.collaborator_id, name: product.Collaborator.name } : null,
        };
    }));
};

const getProductById = async (productId, includeCollaborator = false) => {
    const include = [
        { model: Category, attributes: ['category_id', 'name'] },
        {
            model: ProductVariant,
            include: [
                { model: ProductAttributeValue, include: [{ model: ProductAttribute, attributes: ['attribute_name', 'data_type', 'allowed_values'] }] },
                { model: ProductImage, attributes: ['image_url', 'order'] },
            ],
        },
        { model: CustomizationOption, attributes: ['option_type', 'description'] },
    ];
    if (includeCollaborator) {
        include.push({ model: Collaborator, attributes: ['collaborator_id', 'name'], required: false });
    }

    const product = await Product.findByPk(productId, {
        where: { status: 'active' },
        include,
    });

    if (!product) return null;

    return {
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
                allowed_values: attr.ProductAttribute.allowed_values,
            })),
            images: variant.ProductImages.map(img => ({
                image_url: img.image_url,
                order: img.order,
            })),
        })),
        customizations: product.CustomizationOptions.map(cust => ({
            type: cust.option_type,
            description: cust.description,
        })),
        collaborator: product.Collaborator ? { id: product.Collaborator.collaborator_id, name: product.Collaborator.name } : null,
    };
};

const getVariantsWithFilters = async ({ search, categoryId, productType, page, limit, sortBy, sortOrder }) => {
    const where = {};
    const productWhere = { status: 'active' };
    if (search) {
        where[Op.or] = [
            { sku: { [Op.like]: `%${search}%` } },
            { '$Product.name$': { [Op.like]: `%${search}%` } },
        ];
        if (!isNaN(parseInt(search))) productWhere.category_id = parseInt(search);
    }
    if (categoryId) productWhere.category_id = parseInt(categoryId);
    if (productType) productWhere.product_type = productType;

    let order;
    if (sortBy) {
        if (sortBy === 'product_name') {
            order = [[Product, 'name', sortOrder]];
        } else {
            order = [[sortBy, sortOrder]];
        }
    } else {
        order = [['variant_id', 'DESC']];
    }

    const { count, rows: variants } = await ProductVariant.findAndCountAll({
        where,
        include: [
            {
                model: Product,
                where: productWhere,
                attributes: ['name', 'description', 'category_id', 'product_type'],
                include: [{ model: Category, attributes: ['name'] }],
            },
            { model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false },
        ],
        attributes: ['variant_id', 'sku', 'production_cost', 'profit_margin', 'calculated_price'],
        limit,
        offset: (page - 1) * limit,
        order,
        subQuery: false,
    });

    return { count, variants };
};

// Nuevas funciones auxiliares relacionadas con modelos (sin acceso directo)
const calculatePrice = (productionCost, profitMargin) => {
    const newProductionCost = parseFloat(productionCost);
    const newProfitMargin = parseFloat(profitMargin);
    return newProductionCost * (1 + newProfitMargin / 100);
};

const hasPriceChanges = (variant, newProductionCost, newProfitMargin) => {
    const currentProductionCost = parseFloat(variant.production_cost) || 0;
    const currentProfitMargin = parseFloat(variant.profit_margin) || 0;
    return Math.abs(newProductionCost - currentProductionCost) > 0.01 || Math.abs(newProfitMargin - currentProfitMargin) > 0.01;
};

const createPriceHistoryEntry = (variant, newProductionCost, newProfitMargin, newCalculatedPrice, changeType, userId) => ({
    variant_id: variant.variant_id,
    previous_production_cost: parseFloat(variant.production_cost),
    new_production_cost: newProductionCost,
    previous_profit_margin: parseFloat(variant.profit_margin),
    new_profit_margin: newProfitMargin,
    previous_calculated_price: parseFloat(variant.calculated_price),
    new_calculated_price: newCalculatedPrice,
    change_type: changeType,
    changed_by: userId,
    change_date: new Date(),
});

module.exports = {
    getProductsWithFilters,
    formatProductList,
    getProductById,
    getVariantsWithFilters,
    calculatePrice,
    hasPriceChanges,
    createPriceHistoryEntry,
};