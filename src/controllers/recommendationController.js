const axios = require('axios');
const { Op } = require('sequelize');
const { Product, ProductVariant, ProductImage, Category } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
require('dotenv').config(); // Load environment variables

// Configuration from environment variables
const RECOMMENDER_API_URL = process.env.RECOMMENDER_API_URL || 'https://m3-r8j0.onrender.com';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY, 10) || 1000;

/**
 * Performs an HTTP request with retries for transient errors.
 * @param {string} url - Request URL.
 * @param {object} options - Axios options (method, data, params, etc.).
 * @param {number} retries - Number of retries.
 * @param {number} delay - Initial delay between retries (ms).
 * @returns {Promise<object>} Axios response or error on failure.
 */
const fetchWithRetry = async (url, options, retries = MAX_RETRIES, delay = RETRY_DELAY) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios({ url, ...options, timeout: REQUEST_TIMEOUT });
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      const retryableStatusCodes = [502, 503, 504]; // Transient error codes
      if (isLastAttempt || !error.response || !retryableStatusCodes.includes(error.response.status)) {
        throw error;
      }
      loggerUtils.logCriticalError(`Attempt ${i + 1} failed for ${url} with status ${error.response.status}, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }
};

/**
 * Fetches products from the database by name and formats them.
 * @param {Array<string>} productNames - List of product names.
 * @returns {Promise<Array<object>>} Formatted products.
 */
const fetchAndFormatProducts = async (productNames) => {
  try {
    const products = await Product.findAll({
      where: {
        name: { [Op.in]: productNames },
        status: 'active'
      },
      include: [
        {
          model: ProductVariant,
          attributes: [],
          required: true, // Ensure at least one variant
          where: { 
            is_deleted: false
          },
          include: [{
            model: ProductImage,
            attributes: [],
            where: { order: 1 },
            required: false
          }]
        },
        {
          model: Category,
          attributes: ['name'],
          required: false
        }
      ],
      attributes: [
        'product_id',
        'name',
        'description',
        'product_type',
        'average_rating',
        'total_reviews',
        'created_at',
        'updated_at',
        'collaborator_id',
        'standard_delivery_days',
        'urgent_delivery_enabled',
        'urgent_delivery_days',
        'urgent_delivery_cost',
        [Product.sequelize.fn('MIN', Product.sequelize.col('ProductVariants.calculated_price')), 'min_price'],
        [Product.sequelize.fn('MAX', Product.sequelize.col('ProductVariants.calculated_price')), 'max_price'],
        [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.stock')), 'total_stock'],
        [Product.sequelize.literal(`(
          SELECT pi.image_url 
          FROM product_images pi
          JOIN product_variants pv ON pi.variant_id = pv.variant_id
          WHERE pv.product_id = Product.product_id 
          AND pi.order = 1
          AND pv.is_deleted = false
          AND pv.stock > 0
          LIMIT 1
        )`), 'image_url']
      ],
      group: ['Product.product_id'],
      subQuery: false
    });

    return products.map(product => ({
      product_id: product.product_id,
      name: product.name,
      description: product.description,
      product_type: product.product_type,
      average_rating: product.average_rating || '0.00',
      total_reviews: product.total_reviews || 0,
      min_price: product.getDataValue('min_price') || null,
      max_price: product.getDataValue('max_price') || null,
      total_stock: product.getDataValue('total_stock') || 0,
      variant_count: product.getDataValue('variantCount') || 0,
      category: product.Category?.name || null,
      image_url: product.getDataValue('image_url') || null,
      created_at: product.created_at ? product.created_at.toISOString() : null,
      updated_at: product.updated_at ? product.updated_at.toISOString() : null,
      collaborator: product.collaborator_id ? `Collaborator ${product.collaborator_id}` : null,
      standard_delivery_days: product.standard_delivery_days || null,
      urgent_delivery_enabled: product.urgent_delivery_enabled || false,
      urgent_delivery_days: product.urgent_delivery_days || null,
      urgent_delivery_cost: product.urgent_delivery_cost || null
    }));
  } catch (error) {
    loggerUtils.logCriticalError(`Error fetching products by name: ${error.message}`);
    return [];
  }
};

/**
 * Gets recommendations for the authenticated user and enriches with product data.
 * @param {object} req - Request object.
 * @param {object} res - Response object.
 */
exports.getRecommendations = async (req, res) => {
  const product = req.body.product || req.query.product;
  const cart = req.body.cart || req.query.cart;

  if (!product && !cart) {
    loggerUtils.logCriticalError('Request missing product or cart field');
    return res.status(400).json({
      success: false,
      message: 'Se requiere un producto o carrito',
      error: 'Missing product or cart',
      data: { recommendations: [] }
    });
  }

  try {
    // Construct payload for Flask API
    const payload = product ? { product } : { cart };
    const inputType = product ? 'product' : 'cart';
    const inputValue = product || cart;

    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/recommend`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      data: JSON.stringify(payload)
    });

    const { success, recommendations, count, message, error, input } = response.data;

    if (!success) {
      loggerUtils.logCriticalError(`Error from Flask API: ${error}`);
      return res.status(400).json({
        success: false,
        message: error || 'No se pudieron obtener recomendaciones',
        error: error || 'API error',
        data: { [inputType]: inputValue, recommendations: [] }
      });
    }

    // Enrich recommendations with database data
    const formattedRecommendations = await fetchAndFormatProducts(recommendations || []);

    const formattedResponse = {
      success: true,
      message: message || 'Recomendaciones obtenidas exitosamente',
      data: {
        [inputType]: inputValue,
        recommendations: formattedRecommendations,
        count: formattedRecommendations.length // Use actual number of enriched products
      }
    };

    loggerUtils.logUserActivity('fetch_recommendations', `Recommendations fetched for ${inputType} ${JSON.stringify(inputValue)}`);
    return res.status(200).json(formattedResponse);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || error.message;
    loggerUtils.logCriticalError(`Error fetching recommendations for ${product || cart}: ${errorMessage}`);
    
    return res.status(status).json({
      success: false,
      message: 'No se pudieron obtener recomendaciones',
      error: errorMessage || 'Intenta de nuevo más tarde',
      data: { [product ? 'product' : 'cart']: product || cart, recommendations: [] }
    });
  }
};

/**
 * Checks the status of the recommendation service.
 * @param {object} req - Request object.
 * @param {object} res - Response object.
 */
exports.healthCheck = async (req, res) => {
  try {
    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const { status, model_loaded, rules_count } = response.data;
    return res.status(200).json({
      success: true,
      message: 'Estado del servicio verificado',
      data: {
        status,
        model_loaded,
        rules_count
      }
    });
  } catch (error) {
    const status = error.response?.status || 500;
    loggerUtils.logCriticalError(`Error in health check: ${error.message}`);
    return res.status(status).json({
      success: false,
      message: 'Error al verificar el estado del servicio',
      error: error.message,
      data: { status: 'ERROR', model_loaded: false, rules_count: 0 }
    });
  }
};

module.exports = exports;