const { Cart, CartDetail, Product, ProductVariant, ProductImage, CustomizationOption, User } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

exports.addToCart = async (req, res) => {
  const transaction = await Cart.sequelize.transaction(); // Iniciar una transacción
  try {
    // Obtener datos del cuerpo de la solicitud
    const { product_id, variant_id, quantity, customization_option_id } = req.body;

    // Obtener el user_id del usuario autenticado (ajustado para usar req.user.user_id)
    const user_id = req.user?.user_id; // Alineado con userController.js
    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    // Validar datos de entrada
    if (!product_id || !variant_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos: product_id, variant_id y quantity son obligatorios' });
    }
    if (quantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    // Verificar que el producto y la variante existan
    const product = await Product.findByPk(product_id, { transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    const variant = await ProductVariant.findByPk(variant_id, { transaction });
    if (!variant || variant.product_id !== product_id) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Variante no encontrada o no pertenece al producto' });
    }

    // Verificar stock
    if (variant.stock < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    // Verificar la personalización (si se proporciona)
    let customization = null;
    if (customization_option_id) {
      customization = await CustomizationOption.findByPk(customization_option_id, { transaction });
      if (!customization || customization.product_id !== product_id) {
        await transaction.rollback();
        return res.status(404).json({ message: 'Opción de personalización no encontrada o no pertenece al producto' });
      }
    }

    // Buscar un carrito activo para el usuario
    let cart = await Cart.findOne({
      where: { user_id, status: 'active' },
      transaction
    });

    // Si no existe un carrito activo, crear uno
    if (!cart) {
      cart = await Cart.create(
        { user_id, status: 'active' },
        { transaction }
      );
    }

    // Buscar si el producto con la misma variante y personalización ya está en el carrito
    const existingCartDetail = await CartDetail.findOne({
      where: {
        cart_id: cart.cart_id,
        product_id,
        variant_id,
        customization_option_id: customization_option_id || null
      },
      transaction
    });

    if (existingCartDetail) {
      // Si ya existe, actualizar la cantidad y el subtotal
      const newQuantity = existingCartDetail.quantity + quantity;
      if (variant.stock < newQuantity) {
        await transaction.rollback();
        return res.status(400).json({ message: 'Stock insuficiente para la cantidad total' });
      }
      await existingCartDetail.update(
        {
          quantity: newQuantity,
          unit_price: variant.calculated_price,
          subtotal: newQuantity * variant.calculated_price
        },
        { transaction }
      );
    } else {
      // Si no existe, crear un nuevo registro en CartDetail
      await CartDetail.create(
        {
          cart_id: cart.cart_id,
          product_id,
          variant_id,
          customization_option_id: customization_option_id || null,
          quantity,
          unit_price: variant.calculated_price,
          subtotal: quantity * variant.calculated_price
        },
        { transaction }
      );
    }

    // Confirmar la transacción
    await transaction.commit();
    res.status(200).json({ message: 'Producto añadido al carrito exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al añadir al carrito', error: error.message });
  }
};
// Añadir al final de cartController.js
exports.getCart = async (req, res) => {
  try {
    // Obtener el user_id del usuario autenticado
    const user_id = req.user?.user_id;
    if (!user_id) {
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    // Buscar un carrito activo para el usuario
    const cart = await Cart.findOne({
      where: { user_id, status: 'active' },
      include: [
        {
          model: CartDetail,
          include: [
            { model: Product, attributes: ['product_id', 'name'] },
            {
              model: ProductVariant,
              attributes: ['variant_id', 'sku', 'calculated_price', 'stock'],
              include: [
                { model: ProductImage, attributes: ['image_url', 'order'] } // Incluir las imágenes de la variante
              ]
            },
            { model: CustomizationOption, attributes: ['option_id', 'option_type', 'description'], required: false }
          ]
        }
      ]
    });

    if (!cart) {
      return res.status(200).json({ items: [], total: 0 });
    }

    // Formatear los ítems del carrito
    const items = cart.CartDetails.map(detail => ({
      cart_detail_id: detail.cart_detail_id,
      product_id: detail.product_id,
      product_name: detail.Product.name,
      variant_id: detail.variant_id,
      variant_sku: detail.ProductVariant.sku,
      calculated_price: parseFloat(detail.ProductVariant.calculated_price),
      quantity: detail.quantity,
      unit_price: parseFloat(detail.unit_price),
      subtotal: parseFloat(detail.subtotal),
      customization: detail.CustomizationOption
        ? {
            option_id: detail.CustomizationOption.option_id,
            option_type: detail.CustomizationOption.option_type,
            description: detail.CustomizationOption.description
          }
        : null,
      images: detail.ProductVariant.ProductImages.map(img => ({
        image_url: img.image_url,
        order: img.order
      })) // Incluir las imágenes de la variante
    }));

    res.status(200).json({
      items,
      total: items.reduce((sum, item) => sum + item.quantity, 0) // Total de ítems (ajusta si el backend debería devolver el total monetario)
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener el carrito', error: error.message });
  }
};
// Actualizar la cantidad de un ítem en el carrito
exports.updateCartItem = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
    const { cart_detail_id, quantity } = req.body;
    const user_id = req.user?.user_id;

    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    if (!cart_detail_id || !quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Faltan datos requeridos: cart_detail_id y quantity son obligatorios' });
    }

    if (quantity <= 0) {
      await transaction.rollback();
      return res.status(400).json({ message: 'La cantidad debe ser mayor que 0' });
    }

    // Buscar el detalle del carrito
    const cartDetail = await CartDetail.findByPk(cart_detail_id, {
      include: [
        { model: Cart, where: { user_id, status: 'active' } },
        { model: ProductVariant }
      ],
      transaction
    });

    if (!cartDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
    }

    // Verificar stock
    if (cartDetail.ProductVariant.stock < quantity) {
      await transaction.rollback();
      return res.status(400).json({ message: 'Stock insuficiente' });
    }

    // Actualizar la cantidad y el subtotal
    await cartDetail.update(
      {
        quantity,
        subtotal: quantity * cartDetail.unit_price
      },
      { transaction }
    );

    await transaction.commit();
    res.status(200).json({ message: 'Cantidad actualizada exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al actualizar la cantidad', error: error.message });
  }
};

// Eliminar un ítem del carrito
exports.removeCartItem = async (req, res) => {
  const transaction = await Cart.sequelize.transaction();
  try {
    const cart_detail_id = req.params.cartDetailId;
    const user_id = req.user?.user_id;

    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }

    // Buscar el detalle del carrito
    const cartDetail = await CartDetail.findByPk(cart_detail_id, {
      include: [{ model: Cart, where: { user_id, status: 'active' } }],
      transaction
    });

    if (!cartDetail) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Ítem no encontrado en el carrito' });
    }

    // Eliminar el ítem
    await cartDetail.destroy({ transaction });

    await transaction.commit();
    res.status(200).json({ message: 'Ítem eliminado del carrito exitosamente' });
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al eliminar el ítem', error: error.message });
  }
};