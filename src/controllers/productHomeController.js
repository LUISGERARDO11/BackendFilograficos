const { Op } = require('sequelize');
const { Product, ProductVariant, Order, OrderDetail, ProductImage, Category } = require('../models/Associations');
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

    // 1. Productos destacados (top 12 por average_rating)
    const featuredProducts = await Product.findAll({
      where: { 
        status: 'active',
        average_rating: { [Op.gt]: 0 }
      },
      include: [
        {
          model: ProductVariant,
          attributes: [],
          required: false,
          where: { is_deleted: false },
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
          LIMIT 1
        )`), 'image_url']
      ],
      group: ['Product.product_id'],
      order: [['average_rating', 'DESC'], ['total_reviews', 'DESC']],
      limit: 12,
      subQuery: false
    });

    // 2. Productos recientes (6 más recientes por created_at)
    const recentProducts = await Product.findAll({
      where: { status: 'active' },
      include: [
        {
          model: ProductVariant,
          attributes: [],
          required: false,
          where: { is_deleted: false },
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
          LIMIT 1
        )`), 'image_url']
      ],
      group: ['Product.product_id'],
      order: [['created_at', 'DESC']],
      limit: 6,
      subQuery: false
    });

    // 3. Productos más vendidos (top 12 por cantidad vendida en el mes actual)
    let topSellingProducts = [];
    const whereOrder = {
      created_at: { [Op.gte]: currentMonthStart },
      order_status: { [Op.in]: ['processing', 'shipped', 'delivered'] }
    };

    // Consulta base para el mes actual
    topSellingProducts = await Product.findAll({
      include: [
        {
          model: ProductVariant,
          attributes: [],
          where: { is_deleted: false },
          required: false,
          include: [
            {
              model: OrderDetail,
              attributes: [],
              required: false,
              include: [{
                model: Order,
                attributes: [],
                where: whereOrder,
                required: false
              }]
            }
          ]
        },
        {
          model: Category,
          attributes: ['name'],
          required: false
        }
      ],
      where: { status: 'active' },
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
        [Product.sequelize.fn('COALESCE', Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.OrderDetails.quantity')), 0), 'total_sold'],
        [Product.sequelize.literal(`(
          SELECT pi.image_url 
          FROM product_images pi
          JOIN product_variants pv ON pi.variant_id = pv.variant_id
          WHERE pv.product_id = Product.product_id 
          AND pi.order = 1
          AND pv.is_deleted = false
          LIMIT 1
        )`), 'image_url']
      ],
      group: ['Product.product_id'],
      order: [[Product.sequelize.literal('total_sold'), 'DESC'], ['created_at', 'DESC']],
      limit: 12,
      subQuery: false
    });

    // Si estamos en los primeros 3 días del mes y hay menos de 12 productos, incluir datos del mes anterior
    if (isEarlyMonth && topSellingProducts.length < 12) {
      const additionalProducts = await Product.findAll({
        include: [
          {
            model: ProductVariant,
            attributes: [],
            where: { is_deleted: false },
            required: false,
            include: [
              {
                model: OrderDetail,
                attributes: [],
                required: false,
                include: [{
                  model: Order,
                  attributes: [],
                  where: {
                    created_at: { [Op.between]: [previousMonthStart, previousMonthEnd] },
                    order_status: { [Op.in]: ['processing', 'shipped', 'delivered'] }
                  },
                  required: false
                }]
              }
            ]
          },
          {
            model: Category,
            attributes: ['name'],
            required: false
          }
        ],
        where: {
          status: 'active',
          product_id: { [Op.notIn]: topSellingProducts.map(p => p.product_id) }
        },
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
          [Product.sequelize.fn('COALESCE', Product.sequelize.fn('SUM', Product.sequelize.col('ProductVariants.OrderDetails.quantity')), 0), 'total_sold'],
          [Product.sequelize.literal(`(
            SELECT pi.image_url 
            FROM product_images pi
            JOIN product_variants pv ON pi.variant_id = pv.variant_id
            WHERE pv.product_id = Product.product_id 
            AND pi.order = 1
            AND pv.is_deleted = false
            LIMIT 1
          )`), 'image_url']
        ],
        group: ['Product.product_id'],
        order: [[Product.sequelize.literal('total_sold'), 'DESC'], ['created_at', 'DESC']],
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