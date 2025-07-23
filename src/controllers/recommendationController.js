const axios = require('axios');
const { Op } = require('sequelize');
const { Product, ProductVariant, ProductImage, Category } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
require('dotenv').config(); // Cargar variables de entorno

// Configuración desde variables de entorno
const RECOMMENDER_API_URL = process.env.RECOMMENDER_API_URL || 'https://m3-r8j0.onrender.com';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY, 10) || 1000;

/**
 * Realiza una solicitud HTTP con reintentos para errores transitorios.
 * @param {string} url - URL de la solicitud.
 * @param {object} options - Opciones de axios (método, datos, parámetros, etc.).
 * @param {number} retries - Número de reintentos.
 * @param {number} delay - Retraso inicial entre reintentos (ms).
 * @returns {Promise<object>} Respuesta de axios o error en caso de fallo.
 */
const fetchWithRetry = async (url, options, retries = MAX_RETRIES, delay = RETRY_DELAY) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await axios({ url, ...options, timeout: REQUEST_TIMEOUT });
    } catch (error) {
      const isLastAttempt = i === retries - 1;
      const retryableStatusCodes = [502, 503, 504]; // Códigos de error transitorios
      if (isLastAttempt || !error.response || !retryableStatusCodes.includes(error.response.status)) {
        throw error;
      }
      loggerUtils.logCriticalError(`Intento ${i + 1} fallido para ${url} con status ${error.response.status}, reintentando en ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Backoff exponencial
    }
  }
};

/**
 * Busca productos en la base de datos por nombre y los formatea.
 * @param {Array<string>} productNames - Lista de nombres de productos.
 * @returns {Promise<Array<object>>} Productos formateados.
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
          required: true, // Asegura que tenga al menos una variante
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
        [Product.sequelize.fn('COUNT', Product.sequelize.col('ProductVariants.variant_id')), 'variantCount'],
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
    loggerUtils.logCriticalError(`Error al buscar productos por nombre: ${error.message}`);
    return [];
  }
};

/**
 * Obtiene recomendaciones para el usuario autenticado y enriquece con datos de productos.
 * @param {object} req - Objeto de solicitud.
 * @param {object} res - Objeto de respuesta.
 */
exports.getRecommendations = async (req, res) => {
  const product = req.body.product || req.query.product; // Soporte para POST o GET

  if (!product) {
    loggerUtils.logCriticalError('Solicitud sin campo product');
    return res.status(400).json({
      message: 'El producto es requerido',
      error: 'Missing product',
      data: { recommendations: [] }
    });
  }

  try {
    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/recommend`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      data: JSON.stringify({ product })
    });

    const { success, recommendations, count, message, error } = response.data;

    if (!success) {
      loggerUtils.logCriticalError(`Error en la API Flask: ${error}`);
      return res.status(400).json({
        message: error || 'No se pudieron obtener recomendaciones',
        error: error || 'API error',
        data: { product, recommendations: [] }
      });
    }

    // Enriquecer recomendaciones con datos de la base de datos
    const formattedRecommendations = await fetchAndFormatProducts(recommendations || []);

    const formattedResponse = {
      message: message || 'Recomendaciones obtenidas exitosamente',
      data: {
        product,
        recommendations: formattedRecommendations,
        count: formattedRecommendations.length // Actualizar count con los productos encontrados
      }
    };

    loggerUtils.logUserActivity('fetch_recommendations', `Recommendations fetched for product ${product}`);
    return res.status(200).json(formattedResponse);
  } catch (error) {
    const status = error.response?.status || 500;
    const errorMessage = error.response?.data?.error || error.message;
    loggerUtils.logCriticalError(`Error fetching recommendations for ${product}: ${errorMessage}`);
    
    return res.status(status).json({
      message: 'No se pudieron obtener recomendaciones',
      error: errorMessage || 'Intenta de nuevo más tarde',
      data: { product, recommendations: [] }
    });
  }
};

/**
 * Verifica el estado del servicio de recomendaciones.
 * @param {object} req - Objeto de solicitud.
 * @param {object} res - Objeto de respuesta.
 */
exports.healthCheck = async (req, res) => {
  try {
    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    });

    const { status, model_loaded, rules_count } = response.data;
    return res.status(200).json({
      message: 'Estado del servicio verificado',
      data: {
        status,
        model_loaded,
        rules_count
      }
    });
  } catch (error) {
    const status = error.response?.status || 500;
    loggerUtils.logCriticalError(`Error en health check: ${error.message}`);
    return res.status(status).json({
      message: 'Error al verificar el estado del servicio',
      error: error.message,
      data: { status: 'ERROR', model_loaded: false, rules_count: 0 }
    });
  }
};

module.exports = exports;