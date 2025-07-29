const moment = require('moment-timezone');

/**
 * The provided JavaScript code includes functions for validating pagination parameters, parsing query
 * parameters, and formatting variant, price history, and batch updated variant data.
 * @param page - The `page` parameter is used to specify the page number for pagination. It indicates
 * which page of results should be displayed or retrieved.
 * @param pageSize - The `pageSize` parameter represents the number of items to be displayed per page
 * in a paginated list or results set. It determines how many items will be shown on each page when
 * paginating through a larger set of data.
 */
const validatePagination = (page, pageSize) => {
    if (page < 1 || pageSize < 1) {
        throw new Error('Parámetros de paginación inválidos');
    }
};

const parseQueryParams = (query) => {
    const page = parseInt(query.page, 10) || 1;
    const pageSize = parseInt(query.pageSize, 10) || 10;
    const { sort, categoryId, search, minPrice, maxPrice, collaboratorId, averageRating } = query;
    return { page, pageSize, sort, categoryId, search, minPrice, maxPrice, collaboratorId, averageRating };
};

const formatVariant = (variant) => {
    const lastPriceChange = variant.PriceHistories?.length > 0 ? variant.PriceHistories[0].change_date : null;
    return {
        variant_id: variant.variant_id,
        product_name: variant.Product.name,
        description: variant.Product.description,
        sku: variant.sku,
        image_url: variant.ProductImages?.length > 0 ? variant.ProductImages[0].image_url : null,
        calculated_price: parseFloat(variant.calculated_price).toFixed(2),
        production_cost: parseFloat(variant.production_cost).toFixed(2),
        profit_margin: parseFloat(variant.profit_margin).toFixed(2),
        category: variant.Product.Category ? variant.Product.Category.name : null,
        product_type: variant.Product.product_type,
        updated_at: lastPriceChange
            ? moment(lastPriceChange).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss')
            : 'Sin cambios de precio',
    };
};

const formatPriceHistory = (priceHistory) => {
    return priceHistory.map(entry => ({
        history_id: entry.history_id,
        product_name: entry.ProductVariant.Product.name,
        sku: entry.ProductVariant.sku,
        previous: {
            production_cost: parseFloat(entry.previous_production_cost).toFixed(2),
            profit_margin: parseFloat(entry.previous_profit_margin).toFixed(2),
            calculated_price: parseFloat(entry.previous_calculated_price).toFixed(2),
        },
        new: {
            production_cost: parseFloat(entry.new_production_cost).toFixed(2),
            profit_margin: parseFloat(entry.new_profit_margin).toFixed(2),
            calculated_price: parseFloat(entry.new_calculated_price).toFixed(2),
        },
        change_type: entry.change_type,
        change_description: entry.change_description || 'Sin descripción',
        change_date: moment(entry.change_date).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
        changed_by: {
            user_id: entry.User.user_id,
            name: entry.User.name,
            email: entry.User.email,
        },
    }));
};

const formatBatchUpdatedVariant = (variant) => ({
    variant_id: variant.variant_id,
    product_name: variant.Product.name,
    description: variant.Product.description || null,
    sku: variant.sku,
    image_url: variant.ProductImages?.[0]?.image_url || null,
    production_cost: parseFloat(variant.production_cost).toFixed(2),
    profit_margin: parseFloat(variant.profit_margin).toFixed(2),
    calculated_price: parseFloat(variant.calculated_price).toFixed(2),
    category: variant.Product.Category?.name || null,
    updated_at: moment(variant.updated_at).tz('America/Mexico_City').format('YYYY-MM-DD HH:mm:ss'),
    product_type: variant.Product.product_type,
});

module.exports = { validatePagination, parseQueryParams, formatVariant, formatPriceHistory, formatBatchUpdatedVariant };