const axios = require('axios');
const loggerUtils = require('../utils/loggerUtils');
require('dotenv').config(); // Cargar variables de entorno

// Configuración desde variables de entorno
const RECOMMENDER_API_URL = process.env.RECOMMENDER_API_URL || 'https://recommender-filograficos.onrender.com';
const REQUEST_TIMEOUT = parseInt(process.env.REQUEST_TIMEOUT, 10) || 10000;
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES, 10) || 3;
const RETRY_DELAY = parseInt(process.env.RETRY_DELAY, 10) || 1000;

/**
 * Realiza una solicitud HTTP con reintentos para errores transitorios.
 * @param {string} url - URL de la solicitud.
 * @param {object} options - Opciones de axios (método, datos, parámetros, etc.).
 * @param {number} retries - Número de reintentos.
 * @param {number} delay - Retraso inicial entre reintentos (ms).
 * @returns {Promise<object>} Respuesta de axios.
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
 * Formatea las recomendaciones recibidas desde la API Flask.
 * @param {Array<object>} recommendations - Lista de recomendaciones crudas.
 * @returns {Array<object>} Recomendaciones formateadas.
 */
const formatRecommendations = (recommendations) => {
  return recommendations.map(product => ({
    product_id: product.product_id || null,
    name: product.name || null,
    description: product.description || null,
    product_type: product.product_type || null,
    average_rating: product.average_rating ? parseFloat(product.average_rating) : '0.00',
    total_reviews: product.total_reviews || 0,
    min_price: product.min_price ? parseFloat(product.min_price) : null,
    max_price: product.max_price ? parseFloat(product.max_price) : null,
    total_stock: product.total_stock || 0,
    variant_count: product.variant_count || 0,
    category: product.category || null,
    image_url: product.image_url || null,
    created_at: product.created_at ? new Date(product.created_at).toISOString() : null,
    updated_at: product.updated_at ? new Date(product.updated_at).toISOString() : null,
    collaborator: product.collaborator || null,
    standard_delivery_days: product.standard_delivery_days || null,
    urgent_delivery_enabled: product.urgent_delivery_enabled || false,
    urgent_delivery_days: product.urgent_delivery_days || null,
    urgent_delivery_cost: product.urgent_delivery_cost ? parseFloat(product.urgent_delivery_cost) : null,
    confidence: product.confidence ? parseFloat(product.confidence) : null,
    lift: product.lift ? parseFloat(product.lift) : null
  }));
};

/**
 * Obtiene recomendaciones para el usuario autenticado.
 * @param {object} req - Objeto de solicitud.
 * @param {object} res - Objeto de respuesta.
 */
exports.getRecommendations = async (req, res) => {
  const userId = req.user.user_id;
  try {
    if (!userId) {
      return res.status(400).json({
        message: 'El user_id es requerido',
        error: 'Missing user_id',
        data: { user_id: null, cluster: null, recommendations: [] }
      });
    }

    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/recommendations`, {
      method: 'GET',
      params: { user_id: userId }
    });

    const data = response.data;

    if (!data.recommendations || !Array.isArray(data.recommendations)) {
      throw new Error('Respuesta inválida del API de recomendaciones');
    }

    const formattedResponse = {
      message: data.status || 'Recomendaciones obtenidas exitosamente',
      data: {
        user_id: data.user_id || userId,
        cluster: data.cluster !== undefined ? parseInt(data.cluster) : null,
        recommendations: formatRecommendations(data.recommendations)
      }
    };

    loggerUtils.logUserActivity(userId, 'fetch_recommendations', `Recommendations fetched for user ${userId}, cluster ${data.cluster}`);
    res.status(200).json(formattedResponse);
  } catch (error) {
    const status = error.response ? error.response.status : 500;
    let message = 'Error al obtener recomendaciones';
    let errorMessage = error.message;

    if (status === 400) {
      message = 'Solicitud inválida';
      errorMessage = error.response?.data?.error || 'Parámetros inválidos';
    } else if (status === 404) {
      message = 'Usuario no encontrado o sin recomendaciones';
      errorMessage = error.response?.data?.error || 'No recommendations available';
    }

    loggerUtils.logCriticalError(`Error fetching recommendations for user ${userId}: ${errorMessage}`);
    res.status(status).json({
      message,
      error: errorMessage,
      data: { user_id: userId, cluster: null, recommendations: [] }
    });
  }
};

/**
 * Obtiene recomendaciones basadas en productos comprados.
 * @param {object} req - Objeto de solicitud.
 * @param {object} res - Objeto de respuesta.
 */
exports.getRecommendationsWithProducts = async (req, res) => {
  const userId = req.user.user_id;
  const { purchased_products = [], user_data } = req.body;

  try {
    if (!userId) {
      return res.status(400).json({
        message: 'El user_id es requerido',
        error: 'Missing user_id',
        data: { user_id: null, cluster: null, recommendations: [] }
      });
    }

    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/recommend`, {
      method: 'POST',
      data: { user_id: userId, purchased_products, user_data }
    });

    const data = response.data;

    if (!data.recommendations || !Array.isArray(data.recommendations)) {
      throw new Error('Respuesta inválida del API de recomendaciones');
    }

    const formattedResponse = {
      message: data.status || 'Recomendaciones obtenidas exitosamente',
      data: {
        user_id: data.user_id || userId,
        cluster: data.cluster !== undefined ? parseInt(data.cluster) : null,
        recommendations: formatRecommendations(data.recommendations)
      }
    };

    loggerUtils.logUserActivity(userId, 'fetch_recommendations_with_products', `Recommendations fetched for user ${userId}, cluster ${data.cluster}`);
    res.status(200).json(formattedResponse);
  } catch (error) {
    const status = error.response ? error.response.status : 500;
    let message = 'Error al obtener recomendaciones';
    let errorMessage = error.message;

    if (status === 400) {
      message = 'Solicitud inválida';
      errorMessage = error.response?.data?.error || 'Parámetros inválidos';
    } else if (status === 404) {
      message = 'Sin recomendaciones disponibles';
      errorMessage = error.response?.data?.error || 'No recommendations available';
    }

    loggerUtils.logCriticalError(`Error fetching recommendations with products for user ${userId}: ${errorMessage}`);
    res.status(status).json({
      message,
      error: errorMessage,
      data: { user_id: userId, cluster: null, recommendations: [] }
    });
  }
};

/**
 * Obtiene el resumen de clústeres.
 * @param {object} req - Objeto de solicitud.
 * @param {object} res - Objeto de respuesta.
 */
exports.getClusters = async (req, res) => {
  try {
    const response = await fetchWithRetry(`${RECOMMENDER_API_URL}/clusters`, {
      method: 'GET'
    });

    const data = response.data;

    if (!data || typeof data !== 'object') {
      throw new Error('Respuesta inválida del API de clústeres');
    }

    // Formatear los datos de los clústeres
    const formattedClusters = Object.keys(data).reduce((acc, clusterId) => {
      acc[clusterId] = {
        average_order_quantity: parseFloat(data[clusterId].cantidad_promedio_pedido) || 0,
        total_spent: parseFloat(data[clusterId].gasto_total) || 0,
        number_of_orders: parseFloat(data[clusterId].numero_pedidos) || 0,
        total_units: parseFloat(data[clusterId].unidades_totales) || 0,
        number_of_users: data[clusterId].numero_usuarios || 0
      };
      return acc;
    }, {});

    const formattedResponse = {
      message: 'Resumen de clústeres obtenido exitosamente',
      data: formattedClusters
    };

    loggerUtils.logUserActivity(req.user.user_id, 'fetch_clusters', 'Cluster summary fetched');
    res.status(200).json(formattedResponse);
  } catch (error) {
    const status = error.response ? error.response.status : 500;
    let message = 'Error al obtener el resumen de clústeres';
    let errorMessage = error.message;

    if (status === 500) {
      errorMessage = error.response?.data?.error || 'Error interno del servidor';
    }

    loggerUtils.logCriticalError(`Error fetching clusters: ${errorMessage}`);
    res.status(status).json({
      message,
      error: errorMessage,
      data: {}
    });
  }
};

module.exports = exports;