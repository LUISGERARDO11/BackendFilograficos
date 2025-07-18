const { body, param, query, validationResult } = require('express-validator');
const { Op } = require('sequelize');
const { Review, ReviewMedia, User, Order, Product, OrderDetail, ProductVariant, ProductImage } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { uploadReviewMediaToCloudinary, deleteFromCloudinary } = require('../services/cloudinaryService');

exports.getReviewsByProduct = [
  param('productId')
    .isInt({ min: 1 })
    .withMessage('El ID del producto debe ser un número entero positivo'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),

  async (req, res) => {
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const productId = parseInt(req.params.productId);
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;

      const product = await Product.findByPk(productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'Producto no encontrado' });
      }

      const { count, rows: reviews } = await Review.findAndCountAll({
        where: { product_id: productId },
        include: [
          { model: User, attributes: ['name'] },
          { model: ReviewMedia, attributes: ['media_id', 'url', 'media_type'] },
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      const formattedReviews = reviews.map(review => ({
        review_id: review.review_id,
        user_name: review.User.name,
        rating: review.rating,
        comment: review.comment,
        media: review.ReviewMedia.map(media => ({
          media_id: media.media_id,
          url: media.url,
          media_type: media.media_type,
        })),
        created_at: review.created_at,
      }));

      res.status(200).json({
        success: true,
        message: 'Reseñas obtenidas exitosamente',
        data: {
          reviews: formattedReviews,
          total: count,
          page,
          pageSize,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las reseñas',
        error: error.message,
      });
    }
  },
];

exports.getReviewById = [
  param('reviewId')
    .isInt({ min: 1 })
    .withMessage('El ID de la reseña debe ser un número entero positivo'),

  async (req, res) => {
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      const review = await Review.findByPk(reviewId, {
        include: [
          { model: User, attributes: ['name'] },
          { model: ReviewMedia, attributes: ['media_id', 'url', 'media_type'] },
          {
            model: Product,
            attributes: ['name'],
            include: [
              {
                model: ProductVariant,
                attributes: ['variant_id'],
                include: [
                  {
                    model: ProductImage,
                    attributes: ['image_url'],
                    where: { order: 1 },
                    required: false,
                  },
                ],
                required: false,
              },
            ],
          },
        ],
      });

      if (!review) {
        return res.status(404).json({ success: false, message: 'Reseña no encontrada' });
      }

      const formattedReview = {
        review_id: review.review_id,
        user_name: review.User.name,
        rating: review.rating,
        comment: review.comment,
        product_id: review.product_id,
        order_id: review.order_id,
        product_name: review.Product?.name || 'Producto desconocido',
        image_url: review.Product?.ProductVariants?.[0]?.ProductImages?.[0]?.image_url || null,
        media: review.ReviewMedia.map(media => ({
          media_id: media.media_id,
          url: media.url,
          media_type: media.media_type,
        })),
        created_at: review.created_at,
      };

      res.status(200).json({
        success: true,
        message: 'Reseña obtenida exitosamente',
        data: formattedReview,
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener la reseña',
        error: error.message,
      });
    }
  },
];

exports.createReview = [
  body('product_id')
    .isInt({ min: 1 })
    .withMessage('El ID del producto debe ser un número entero positivo'),
  body('order_id')
    .isInt({ min: 1 })
    .withMessage('El ID del pedido debe ser un número entero positivo'),
  body('rating')
    .isInt({ min: 1, max: 5 })
    .withMessage('La calificación debe ser un número entero entre 1 y 5'),
  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('El comentario no puede exceder los 500 caracteres'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const { product_id, order_id, rating, comment } = req.body;

      // Validar usuario activo
      const user = await User.findByPk(userId);
      if (!user || user.status !== 'activo') {
        return res.status(403).json({ success: false, message: 'Usuario no autorizado o cuenta inactiva' });
      }

      // Validar que el pedido existe y pertenece al usuario
      const order = await Order.findOne({
        where: {
          order_id: order_id,
          user_id: userId,
          order_status: 'delivered',
        },
      });

      if (!order) {
        return res.status(403).json({
          success: false,
          message: 'El pedido no existe, no pertenece al usuario autenticado o no está entregado',
        });
      }

      // Validar que el pedido contiene el producto a través de la variante
      const orderDetails = await OrderDetail.findAll({
        where: { order_id },
        include: [{
          model: ProductVariant,
          where: { product_id },
          attributes: ['product_id'],
        }],
      });

      if (!orderDetails || orderDetails.length === 0) {
        return res.status(403).json({
          success: false,
          message: 'El pedido no contiene el producto especificado',
        });
      }

      // Validar que no exista una reseña para este pedido y producto
      const existingReview = await Review.findOne({
        where: { order_id, product_id, user_id: userId },
      });
      if (existingReview) {
        return res.status(400).json({
          success: false,
          message: 'Ya existe una reseña para este pedido y producto',
        });
      }

      // Crear reseña
      const review = await Review.create({
        user_id: userId,
        product_id,
        order_id,
        rating,
        comment,
        created_at: new Date(),
      });

      // Subir medios a Cloudinary si se proporcionaron
      const media = [];
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { secure_url, public_id, resource_type } = await uploadReviewMediaToCloudinary(file.buffer, review.review_id, file.originalname);
          const mediaType = resource_type === 'video' ? 'video' : 'image';
          const mediaEntry = await ReviewMedia.create({
            review_id: review.review_id,
            url: secure_url,
            public_id,
            media_type: mediaType,
            created_at: new Date(),
          });
          media.push({ media_id: mediaEntry.media_id, url: mediaEntry.url, media_type: mediaEntry.media_type });
        }
      }

      loggerUtils.logUserActivity(userId, 'create_review', `Reseña creada: ID ${review.review_id}, Producto ${product_id}`);

      res.status(201).json({
        success: true,
        message: 'Reseña creada exitosamente',
        data: {
          review_id: review.review_id,
          user_name: user.name,
          rating: review.rating,
          comment: review.comment,
          media,
          created_at: review.created_at,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al crear la reseña',
        error: error.message,
      });
    }
  },
];

exports.updateReview = [
  param('reviewId')
    .isInt({ min: 1 })
    .withMessage('El ID de la reseña debe ser un número entero positivo'),
  body('rating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La calificación debe ser un número entero entre 1 y 5'),
  body('comment')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('El comentario no puede exceder los 500 caracteres'),
  body('media_to_delete')
    .optional()
    .isArray()
    .withMessage('Los IDs de medios a eliminar deben ser un arreglo'),
  body('media_to_delete.*')
    .isInt({ min: 1 })
    .withMessage('Cada ID de medio a eliminar debe ser un número entero positivo'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      const { rating, comment, media_to_delete = [] } = req.body;

      // Verificar reseña y permisos
      const review = await Review.findByPk(reviewId, {
        include: [{ model: ReviewMedia }],
      });
      if (!review) {
        return res.status(404).json({ success: false, message: 'Reseña no encontrada' });
      }

      const user = await User.findByPk(userId);
      if (!user || user.status !== 'activo') {
        return res.status(403).json({ success: false, message: 'Usuario no autorizado o cuenta inactiva' });
      }

      if (review.user_id !== userId) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para editar esta reseña' });
      }

      // Eliminar medios especificados
      if (media_to_delete.length > 0) {
        const mediaToDelete = await ReviewMedia.findAll({
          where: { media_id: { [Op.in]: media_to_delete }, review_id: reviewId },
        });
        for (const media of mediaToDelete) {
          await deleteFromCloudinary(media.public_id);
          await media.destroy();
        }
      }

      // Subir nuevos medios si se proporcionaron
      const media = review.ReviewMedia.map(m => ({
        media_id: m.media_id,
        url: m.url,
        media_type: m.media_type,
      }));
      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const { secure_url, public_id, resource_type } = await uploadReviewMediaToCloudinary(file.buffer, review.review_id, file.originalname);
          const mediaType = resource_type === 'video' ? 'video' : 'image';
          const mediaEntry = await ReviewMedia.create({
            review_id: review.review_id,
            url: secure_url,
            public_id,
            media_type: mediaType,
            created_at: new Date(),
          });
          media.push({ media_id: mediaEntry.media_id, url: mediaEntry.url, media_type: mediaEntry.media_type });
        }
      }

      // Actualizar reseña
      await review.update({
        rating: rating || review.rating,
        comment: comment !== undefined ? comment : review.comment,
      });

      loggerUtils.logUserActivity(userId, 'update_review', `Reseña actualizada: ID ${review.review_id}`);

      res.status(200).json({
        success: true,
        message: 'Reseña actualizada exitosamente',
        data: {
          review_id: review.review_id,
          user_name: user.name,
          rating: review.rating,
          comment: review.comment,
          media,
          created_at: review.created_at,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al actualizar la reseña',
        error: error.message,
      });
    }
  },
];

exports.deleteReviewByOwner = [
  param('reviewId')
    .isInt({ min: 1 })
    .withMessage('El ID de la reseña debe ser un número entero positivo'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      const review = await Review.findByPk(reviewId, {
        include: [{ model: ReviewMedia }],
      });
      if (!review) {
        return res.status(404).json({ success: false, message: 'Reseña no encontrada' });
      }

      const user = await User.findByPk(userId);
      if (!user || user.status !== 'activo') {
        return res.status(403).json({ success: false, message: 'Usuario no autorizado o cuenta inactiva' });
      }

      if (review.user_id !== userId) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para eliminar esta reseña' });
      }

      // Eliminar medios de Cloudinary
      for (const media of review.ReviewMedia) {
        await deleteFromCloudinary(media.public_id);
        await media.destroy();
      }

      // Eliminar reseña
      await review.destroy();

      loggerUtils.logUserActivity(userId, 'delete_review_owner', `Reseña eliminada por propietario: ID ${reviewId}`);

      res.status(200).json({
        success: true,
        message: 'Reseña eliminada exitosamente',
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar la reseña',
        error: error.message,
      });
    }
  },
];

exports.deleteReviewByAdmin = [
  param('reviewId')
    .isInt({ min: 1 })
    .withMessage('El ID de la reseña debe ser un número entero positivo'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const reviewId = parseInt(req.params.reviewId);
      const review = await Review.findByPk(reviewId, {
        include: [{ model: ReviewMedia }],
      });
      if (!review) {
        return res.status(404).json({ success: false, message: 'Reseña no encontrada' });
      }

      // Eliminar medios de Cloudinary
      for (const media of review.ReviewMedia) {
        await deleteFromCloudinary(media.public_id);
        await media.destroy();
      }

      // Eliminar reseña
      await review.destroy();

      loggerUtils.logUserActivity(userId, 'delete_review_admin', `Reseña eliminada por administrador: ID ${reviewId}`);

      res.status(200).json({
        success: true,
        message: 'Reseña eliminada exitosamente por administrador',
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al eliminar la reseña por administrador',
        error: error.message,
      });
    }
  },
];

exports.getReviewsForAdmin = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),
  query('productId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El ID del producto debe ser un número entero positivo'),
  query('userId')
    .optional()
    .isInt({ min: 1 })
    .withMessage('El ID del usuario debe ser un número entero positivo'),
  query('minRating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La calificación mínima debe ser un número entero entre 1 y 5'),
  query('maxRating')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La calificación máxima debe ser un número entero entre 1 y 5'),

  async (req, res) => {
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;
      const productId = req.query.productId ? parseInt(req.query.productId) : null;
      const userId = req.query.userId ? parseInt(req.query.userId) : null;
      const minRating = req.query.minRating ? parseInt(req.query.minRating) : null;
      const maxRating = req.query.maxRating ? parseInt(req.query.maxRating) : null;

      const where = {};
      if (productId) where.product_id = productId;
      if (userId) where.user_id = userId;
      if (minRating || maxRating) {
        where.rating = {};
        if (minRating) where.rating[Op.gte] = minRating;
        if (maxRating) where.rating[Op.lte] = maxRating;
      }

      const { count, rows: reviews } = await Review.findAndCountAll({
        where,
        include: [
          { model: User, attributes: ['name', 'email'] },
          { model: Product, attributes: ['name'] },
          { model: ReviewMedia, attributes: ['media_id', 'url', 'media_type'] },
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });

      const formattedReviews = reviews.map(review => ({
        review_id: review.review_id,
        user_name: review.User.name,
        user_email: review.User.email,
        product_name: review.Product.name,
        rating: review.rating,
        comment: review.comment,
        media: review.ReviewMedia.map(media => ({
          media_id: media.media_id,
          url: media.url,
          media_type: media.media_type,
        })),
        created_at: review.created_at,
      }));

      res.status(200).json({
        success: true,
        message: 'Reseñas obtenidas exitosamente',
        data: {
          reviews: formattedReviews,
          total: count,
          page,
          pageSize,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las reseñas para administradores',
        error: error.message,
      });
    }
  },
];

exports.getUserReviews = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;

      const { count, rows: reviews } = await Review.findAndCountAll({
        where: { user_id: userId },
        attributes: ['review_id', 'product_id', 'order_id', 'rating', 'comment', 'created_at'],
        include: [
          { model: User, attributes: ['name'] },
          { model: Product, attributes: ['name'] },
          { model: ReviewMedia, attributes: ['media_id', 'url', 'media_type'] },
          {
            model: Order,
            attributes: ['order_id'],
            required: false,
            include: [
              {
                model: OrderDetail,
                attributes: ['variant_id'],
                required: false,
                include: [
                  {
                    model: ProductVariant,
                    attributes: ['variant_id', 'product_id'],
                    required: false,
                    include: [
                      {
                        model: ProductImage,
                        attributes: ['image_url'],
                        where: { order: 1 },
                        required: false,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
        order: [['created_at', 'DESC']],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        distinct: true, // Ensure unique review counts
      });

      const formattedReviews = reviews.map(review => ({
        review_id: review.review_id,
        user_name: review.User?.name || 'Usuario desconocido',
        product_name: review.Product?.name || 'Producto desconocido',
        rating: review.rating,
        comment: review.comment,
        media: review.ReviewMedia?.map(media => ({
          media_id: media.media_id,
          url: media.url,
          media_type: media.media_type,
        })) || [],
        created_at: review.created_at,
        image_url:
          review.Order?.OrderDetails?.[0]?.ProductVariant?.ProductImages?.[0]?.image_url || null,
      }));

      res.status(200).json({
        success: true,
        message: 'Reseñas del usuario obtenidas exitosamente',
        data: {
          reviews: formattedReviews,
          total: count,
          page,
          pageSize,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener las reseñas del usuario',
        error: error.message,
      });
    }
  },
];

exports.getPendingReviews = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La página debe ser un número entero positivo'),
  query('pageSize')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('El tamaño de página debe ser un número entero entre 1 y 100'),

  async (req, res) => {
    const userId = req.user.user_id;
    const errors = validationResult(req);
    try {
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Errores de validación',
          errors: errors.array(),
        });
      }

      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.pageSize) || 20;

      // Obtener pedidos entregados del usuario
      const orders = await Order.findAll({
        where: { user_id: userId, order_status: 'delivered' },
        attributes: ['order_id', 'created_at'],
        include: [
          {
            model: OrderDetail,
            attributes: ['variant_id'],
            include: [
              {
                model: ProductVariant,
                attributes: ['product_id', 'variant_id'],
                include: [
                  { model: Product, attributes: ['name'] },
                  {
                    model: ProductImage,
                    attributes: ['image_url'],
                    where: { order: 1 },
                    required: false,
                  },
                ],
              },
            ],
          },
        ],
      });

      // Identificar productos sin reseñas
      const pendingReviews = [];
      for (const order of orders) {
        for (const detail of order.OrderDetails || []) {
          const productId = detail.ProductVariant?.product_id;
          if (!productId) continue; // Saltar si no hay product_id
          const existingReview = await Review.findOne({
            where: { user_id: userId, product_id: productId, order_id: order.order_id },
          });
          if (!existingReview) {
            pendingReviews.push({
              order_id: order.order_id,
              product_id: productId,
              product_name: detail.ProductVariant?.Product?.name || 'Producto desconocido',
              order_date: order.created_at,
              image_url: detail.ProductVariant?.ProductImages?.[0]?.image_url || null,
            });
          }
        }
      }

      // Aplicar paginación
      const total = pendingReviews.length;
      const paginatedPendingReviews = pendingReviews.slice((page - 1) * pageSize, page * pageSize);

      res.status(200).json({
        success: true,
        message: 'Compras pendientes de reseña obtenidas exitosamente',
        data: {
          pendingReviews: paginatedPendingReviews,
          total,
          page,
          pageSize,
        },
      });
    } catch (error) {
      loggerUtils.logCriticalError(error);
      res.status(500).json({
        success: false,
        message: 'Error al obtener compras pendientes de reseña',
        error: error.message,
      });
    }
  },
];

module.exports = exports;