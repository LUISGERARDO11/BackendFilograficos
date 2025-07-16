const { Op } = require('sequelize');
const { Product, ProductVariant, Order, OrderDetail, ProductImage } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Método: Obtener datos para el home (productos destacados, recientes y más vendidos)
exports.getHomeData = async (req, res) => {
  try {
    const currentDate = new Date();
    const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const currentDay = currentDate.getDate();
    const isEarlyMonth = currentDay <= 3; // Primeros 3 días del mes
    const previousMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const previousMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0, 23, 59, 59, 999);

    // Función auxiliar para formatear productos
    const formatProducts = (products) => products.map(product => ({
      product_id: product.product_id,
      name: product.name,
      description: product.description,
      average_rating: product.average_rating,
      total_reviews: product.total_reviews,
      image: Array.isArray(product.ProductVariants) && product.ProductVariants.length > 0 
        ? product.ProductVariants[0].ProductImages?.[0]?.image_url || null 
        : null,
      created_at: product.created_at
    }));

    // 1. Productos destacados (top 12 por average_rating)
    const featuredProducts = await Product.findAll({
      where: { status: 'active', average_rating: { [Op.gt]: 0 } },
      include: [{
        model: ProductVariant,
        attributes: ['variant_id'],
        required: false,
        include: [{
          model: ProductImage,
          attributes: ['image_url'],
          where: { order: 1 },
          required: false
        }]
      }],
      order: [['average_rating', 'DESC'], ['total_reviews', 'DESC']],
      limit: 12,
      attributes: ['product_id', 'name', 'description', 'average_rating', 'total_reviews', 'created_at']
    });

    // 2. Productos recientes (6 más recientes por created_at)
    const recentProducts = await Product.findAll({
      where: { status: 'active' },
      include: [{
        model: ProductVariant,
        attributes: ['variant_id'],
        required: false,
        include: [{
          model: ProductImage,
          attributes: ['image_url'],
          where: { order: 1 },
          required: false
        }]
      }],
      order: [['created_at', 'DESC']],
      limit: 6,
      attributes: ['product_id', 'name', 'description', 'average_rating', 'total_reviews', 'created_at']
    });

    // 3. Productos más vendidos (top 12 por cantidad vendida en el mes actual)
    let topSellingProducts = [];
    const whereOrder = {
      created_at: { [Op.gte]: currentMonthStart },
      order_status: { [Op.in]: ['processing', 'shipped', 'delivered'] } // Solo órdenes confirmadas
    };

    // Consulta base para el mes actual
    topSellingProducts = await Product.findAll({
      include: [
        {
          model: ProductVariant,
          attributes: ['variant_id'],
          include: [
            {
              model: OrderDetail,
              attributes: [],
              include: [{
                model: Order,
                attributes: [],
                where: whereOrder
              }]
            },
            {
              model: ProductImage,
              attributes: ['image_url'],
              where: { order: 1 },
              required: false
            }
          ]
        }
      ],
      where: { status: 'active' },
      attributes: [
        'product_id',
        'name',
        'description',
        'average_rating',
        'total_reviews',
        'created_at',
        [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.OrderDetails.quantity')), 'total_sold']
      ],
      group: ['Product.product_id', 'ProductVariants.variant_id', 'ProductVariants.ProductImages.image_id'],
      order: [[Product.sequelize.literal('total_sold'), 'DESC']],
      limit: 12,
      subQuery: false
    });

    // Si estamos en los primeros 3 días del mes y hay menos de 12 productos, incluir datos del mes anterior
    if (isEarlyMonth && topSellingProducts.length < 12) {
      const additionalProducts = await Product.findAll({
        include: [
          {
            model: ProductVariant,
            attributes: ['variant_id'],
            include: [
              {
                model: OrderDetail,
                attributes: [],
                include: [{
                  model: Order,
                  attributes: [],
                  where: {
                    created_at: { [Op.between]: [previousMonthStart, previousMonthEnd] },
                    order_status: { [Op.in]: ['processing', 'shipped', 'delivered'] }
                  }
                }]
              },
              {
                model: ProductImage,
                attributes: ['image_url'],
                where: { order: 1 },
                required: false
              }
            ]
          }
        ],
        where: {
          status: 'active',
          product_id: { [Op.notIn]: topSellingProducts.map(p => p.product_id) } // Excluir productos ya obtenidos
        },
        attributes: [
          'product_id',
          'name',
          'description',
          'average_rating',
          'total_reviews',
          'created_at',
          [Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.OrderDetails.quantity')), 'total_sold']
        ],
        group: ['Product.product_id', 'ProductVariants.variant_id', 'ProductVariants.ProductImages.image_id'],
        order: [[Product.sequelize.literal('total_sold'), 'DESC']],
        limit: 12 - topSellingProducts.length,
        subQuery: false
      });

      topSellingProducts = [...topSellingProducts, ...additionalProducts].slice(0, 12);
    }

    // Formatear respuesta
    const response = {
      message: 'Datos del home obtenidos exitosamente',
      data: {
        featuredProducts: formatProducts(featuredProducts),
        recentProducts: formatProducts(recentProducts),
        topSellingProducts: formatProducts(topSellingProducts)
      }
    };

    res.status(200).json(response);
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      message: 'Error al obtener datos del home',
      error: error.message,
      data: {
        featuredProducts: [],
        recentProducts: [],
        topSellingProducts: []
      }
    });
  }
};

module.exports = exports;