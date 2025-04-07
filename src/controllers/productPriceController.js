const { Op } = require('sequelize');
const { Product, ProductVariant, ProductImage, PriceHistory, Category, User } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const productServices = require('../services/productServices');
const productUtils = require('../utils/productUtils');

exports.getAllVariants = async (req, res) => {
    try {
        const { search, category_id, product_type, page = 1, limit = 50, sortBy, sortOrder = 'DESC' } = req.query;
        productUtils.validatePagination(page, limit);

        const where = {};
        const productWhere = { status: 'active' };

        if (search) {
            where[Op.or] = [
                { sku: { [Op.like]: `%${search}%` } },
                { '$Product.name$': { [Op.like]: `%${search}%` } },
            ];
            if (!isNaN(parseInt(search))) productWhere.category_id = parseInt(search);
        }

        if (category_id) {
            productWhere.category_id = parseInt(category_id);
            const categoryExists = await Category.findByPk(category_id);
            if (!categoryExists) return res.status(404).json({ message: 'Categoría no encontrada' });
        }

        if (product_type) productWhere.product_type = product_type;

        let order = [];
        if (sortBy) {
            if (sortBy === 'product_name') order = [[Product, 'name', sortOrder]];
            else if (sortBy === 'updated_at') order = [[{ model: PriceHistory }, 'change_date', sortOrder]];
            else order = [[sortBy, sortOrder]];
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
                { model: PriceHistory, attributes: ['change_date'], order: [['change_date', 'DESC']], limit: 1, required: false },
            ],
            attributes: ['variant_id', 'sku', 'production_cost', 'profit_margin', 'calculated_price'],
            limit: parseInt(limit),
            offset: (parseInt(page) - 1) * parseInt(limit),
            order,
            subQuery: false,
        });

        const formattedVariants = variants.map(productUtils.formatVariant);

        res.status(200).json({
            message: 'Variantes obtenidas exitosamente',
            variants: formattedVariants,
            total: count,
            page: parseInt(page),
            pageSize: parseInt(limit),
        });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(error.message === 'Parámetros de paginación inválidos' ? 400 : 500).json({ message: 'Error al obtener las variantes', error: error.message });
    }
};

exports.getVariantById = async (req, res) => {
    try {
        const { id } = req.params;

        const variant = await ProductVariant.findByPk(id, {
            include: [
                { model: Product, where: { status: 'active' }, attributes: ['name', 'description'] },
                { model: ProductImage, attributes: ['image_url'], where: { order: 1 }, required: false },
                { model: PriceHistory, attributes: ['change_date'], order: [['change_date', 'DESC']], limit: 1, required: false },
            ],
            attributes: ['variant_id', 'sku', 'production_cost', 'profit_margin', 'calculated_price'],
        });

        if (!variant) return res.status(404).json({ message: 'Variante no encontrada' });

        const formattedVariant = productUtils.formatVariant(variant);

        res.status(200).json({ message: 'Variante obtenida exitosamente', variant: formattedVariant });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener la variante', error: error.message });
    }
};

exports.getPriceHistoryByVariantId = async (req, res) => {
    try {
        const { variant_id } = req.params;

        const variant = await ProductVariant.findByPk(variant_id);
        if (!variant) return res.status(404).json({ message: 'Variante no encontrada' });

        const priceHistory = await PriceHistory.findAll({
            where: { variant_id },
            attributes: [
                'history_id', 'previous_production_cost', 'new_production_cost', 'previous_profit_margin',
                'new_profit_margin', 'previous_calculated_price', 'new_calculated_price', 'change_type',
                'change_description', 'change_date',
            ],
            order: [['change_date', 'DESC']],
            include: [
                { model: ProductVariant, attributes: ['sku'], include: [{ model: Product, attributes: ['name'] }] },
                { model: User, attributes: ['user_id', 'name', 'email'] },
            ],
        });

        if (!priceHistory.length) return res.status(200).json({ message: 'No se encontraron cambios de precio para esta variante', history: [] });

        const formattedHistory = productUtils.formatPriceHistory(priceHistory);

        res.status(200).json({ message: 'Historial de precios obtenido exitosamente', history: formattedHistory });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al obtener el historial de precios', error: error.message });
    }
};

exports.updateVariantPrice = async (req, res) => {
    try {
        const { id } = req.params;
        const { production_cost, profit_margin } = req.body;
        const userId = req.user.user_id;

        const variant = await ProductVariant.findByPk(id, { include: [{ model: Product, attributes: ['name', 'status'] }] });
        if (!variant) return res.status(404).json({ message: 'Variante no encontrada' });
        if (variant.Product.status === 'inactive') return res.status(400).json({ message: 'No se puede actualizar el precio de un producto inactivo' });

        const newProductionCost = parseFloat(production_cost);
        const newProfitMargin = parseFloat(profit_margin);
        const newCalculatedPrice = productServices.calculatePrice(newProductionCost, newProfitMargin);

        await PriceHistory.create(productServices.createPriceHistoryEntry(variant, newProductionCost, newProfitMargin, newCalculatedPrice, 'manual', userId));

        await variant.update({ production_cost: newProductionCost, profit_margin: newProfitMargin, calculated_price: newCalculatedPrice, updated_at: new Date() });

        loggerUtils.logUserActivity(userId, 'update', `Precio actualizado para variante ${variant.sku} (${id}): $${newCalculatedPrice.toFixed(2)}`);
        const formattedVariant = productUtils.formatBatchUpdatedVariant(variant);

        res.status(200).json({ message: `Precio actualizado a $${newCalculatedPrice.toFixed(2)}`, variant: formattedVariant });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al actualizar el precio', error: error.message });
    }
};

exports.batchUpdateVariantPrices = async (req, res) => {
    try {
        const { variant_ids, production_cost, profit_margin } = req.body;
        const userId = req.user.user_id;

        const dbVariants = await ProductVariant.findAll({
            where: { variant_id: { [Op.in]: variant_ids } },
            include: [
                { model: Product, attributes: ['name', 'description', 'status', 'product_type', 'category_id'], include: [{ model: Category, attributes: ['name'] }] },
                { model: ProductImage, attributes: ['image_url'], limit: 1 },
            ],
        });

        if (dbVariants.length === 0) return res.status(404).json({ message: 'No se encontraron variantes para los IDs proporcionados' });

        const missingIds = variant_ids.filter(id => !dbVariants.some(v => v.variant_id === id));
        if (missingIds.length > 0) return res.status(404).json({ message: `Las siguientes variantes no fueron encontradas: ${missingIds.join(', ')}` });

        const inactiveProducts = dbVariants.filter(v => v.Product.status === 'inactive');
        if (inactiveProducts.length > 0) return res.status(400).json({ message: `No se pueden actualizar precios de variantes de productos inactivos: ${inactiveProducts.map(v => v.sku).join(', ')}` });

        const newProductionCost = parseFloat(production_cost);
        const newProfitMargin = parseFloat(profit_margin);
        const newCalculatedPrice = productServices.calculatePrice(newProductionCost, newProfitMargin);

        const updatedVariants = [];
        const priceHistoryEntries = [];

        for (const variant of dbVariants) {
            if (productServices.hasPriceChanges(variant, newProductionCost, newProfitMargin)) {
                priceHistoryEntries.push(productServices.createPriceHistoryEntry(variant, newProductionCost, newProfitMargin, newCalculatedPrice, 'batch_update', userId));
                await variant.update({ production_cost: newProductionCost, profit_margin: newProfitMargin, calculated_price: newCalculatedPrice, updated_at: new Date() });
                loggerUtils.logUserActivity(userId, 'batch_update', `Precio actualizado en lote para variante ${variant.sku} (${variant.variant_id}): $${newCalculatedPrice.toFixed(2)}`);
            }
            updatedVariants.push(variant);
        }

        if (priceHistoryEntries.length > 0) await PriceHistory.bulkCreate(priceHistoryEntries);

        const formattedVariants = updatedVariants.map(productUtils.formatBatchUpdatedVariant);

        res.status(200).json({ message: `Precios actualizados exitosamente para ${priceHistoryEntries.length} variantes`, variants: formattedVariants });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al actualizar los precios en lote', error: error.message });
    }
};

exports.batchUpdateVariantPricesIndividual = async (req, res) => {
    try {
        const { variants } = req.body;
        const userId = req.user.user_id;

        const variantIds = variants.map(v => v.variant_id);
        const dbVariants = await ProductVariant.findAll({
            where: { variant_id: { [Op.in]: variantIds } },
            include: [
                { model: Product, attributes: ['name', 'description', 'status', 'product_type', 'category_id'], include: [{ model: Category, attributes: ['name'] }] },
                { model: ProductImage, attributes: ['image_url'], limit: 1 },
            ],
        });

        if (dbVariants.length === 0) return res.status(404).json({ message: 'No se encontraron variantes para los IDs proporcionados' });

        const missingIds = variantIds.filter(id => !dbVariants.some(v => v.variant_id === id));
        if (missingIds.length > 0) return res.status(404).json({ message: `Las siguientes variantes no fueron encontradas: ${missingIds.join(', ')}` });

        const inactiveProducts = dbVariants.filter(v => v.Product.status === 'inactive');
        if (inactiveProducts.length > 0) return res.status(400).json({ message: `No se pueden actualizar precios de variantes de productos inactivos: ${inactiveProducts.map(v => v.sku).join(', ')}` });

        const updatedVariants = [];
        const priceHistoryEntries = [];

        for (const variantData of variants) {
            const variant = dbVariants.find(v => v.variant_id === variantData.variant_id);
            const newProductionCost = parseFloat(variantData.production_cost);
            const newProfitMargin = parseFloat(variantData.profit_margin);
            const newCalculatedPrice = productServices.calculatePrice(newProductionCost, newProfitMargin);

            if (productServices.hasPriceChanges(variant, newProductionCost, newProfitMargin)) {
                priceHistoryEntries.push(productServices.createPriceHistoryEntry(variant, newProductionCost, newProfitMargin, newCalculatedPrice, 'batch_update_individual', userId));
                await variant.update({ production_cost: newProductionCost, profit_margin: newProfitMargin, calculated_price: newCalculatedPrice, updated_at: new Date() });
                loggerUtils.logUserActivity(userId, 'batch_update_individual', `Precio actualizado en lote individual para variante ${variant.sku} (${variant.variant_id}): $${newCalculatedPrice.toFixed(2)}`);
            }
            updatedVariants.push(variant);
        }

        if (priceHistoryEntries.length > 0) await PriceHistory.bulkCreate(priceHistoryEntries);

        const formattedVariants = updatedVariants.map(productUtils.formatBatchUpdatedVariant);

        res.status(200).json({ message: `Precios actualizados exitosamente para ${priceHistoryEntries.length} variantes`, variants: formattedVariants });
    } catch (error) {
        loggerUtils.logCriticalError(error);
        res.status(500).json({ message: 'Error al actualizar los precios en lote individual', error: error.message });
    }
};

module.exports = exports;