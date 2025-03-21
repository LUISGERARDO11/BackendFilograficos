const { Cart, CartDetail, Product, ProductVariant, CustomizationOption, User } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

exports.addToCart = async (req, res) => {
  const transaction = await Cart.sequelize.transaction(); // Iniciar una transacción
  try {
    // Obtener datos del cuerpo de la solicitud
    const { product_id, variant_id, quantity, customization_option_id } = req.body;

    // Obtener el user_id del usuario autenticado (asumiendo que usas un middleware de autenticación)
    const user_id = req.user?.id; // Ajusta esto según tu middleware de autenticación (por ejemplo, req.user.id si usas JWT)

    // Validar datos de entrada
    if (!user_id) {
      await transaction.rollback();
      return res.status(401).json({ message: 'Usuario no autenticado' });
    }
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