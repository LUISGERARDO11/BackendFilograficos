const { Customization, CustomizationOption, Product } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');

// Obtener las opciones de personalización para un producto
exports.getCustomizationOptions = async (req, res) => {
  try {
    const { productId } = req.params;

    // Validar que el productId sea un número válido
    const productIdNum = parseInt(productId, 10);
    if (isNaN(productIdNum)) {
      return res.status(400).json({ message: 'El ID del producto debe ser un número válido' });
    }

    // Verificar que el producto exista y esté activo
    const product = await Product.findByPk(productIdNum, { where: { status: 'active' } });
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado o no está activo' });
    }

    const options = await CustomizationOption.findAll({
      where: { product_id: productIdNum },
    });

    if (!options || options.length === 0) {
      return res.status(404).json({ message: 'No se encontraron opciones de personalización para este producto' });
    }

    // Formatear las opciones para que coincidan con el estilo del catálogo
    const formattedOptions = options.map(option => ({
      option_id: option.option_id,
      product_id: option.product_id,
      option_type: option.option_type,
      description: option.description,
    }));

    res.status(200).json({
      message: 'Opciones de personalización obtenidas exitosamente',
      options: formattedOptions,
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al obtener las opciones de personalización', error: error.message });
  }
};

// Crear una personalización para un producto
exports.createCustomization = async (req, res) => {
  try {
    const { productId, optionType, content, fileUrl, comments } = req.body;

    // Validar que el productId sea un número válido
    const productIdNum = parseInt(productId, 10);
    if (isNaN(productIdNum)) {
      return res.status(400).json({ message: 'El ID del producto debe ser un número válido' });
    }

    // Verificar que el producto exista y esté activo
    const product = await Product.findByPk(productIdNum, { where: { status: 'active' } });
    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado o no está activo' });
    }

    // Validar que la opción de personalización exista para este producto
    const customizationOption = await CustomizationOption.findOne({
      where: { product_id: productIdNum, option_type: optionType },
    });
    if (!customizationOption) {
      return res.status(400).json({ message: 'Opción de personalización no válida para este producto' });
    }

    // Crear la personalización
    const customization = await Customization.create({
      product_id: productIdNum,
      option_type: optionType,
      content: content || null,
      file_url: fileUrl || null,
      comments: comments || null,
      status: 'initial',
      revision_count: 0,
    });

    // Formatear la respuesta para que sea consistente
    const formattedCustomization = {
      customization_id: customization.customization_id,
      product_id: customization.product_id,
      option_type: customization.option_type,
      content: customization.content,
      file_url: customization.file_url,
      comments: customization.comments,
      status: customization.status,
      revision_count: customization.revision_count,
    };

    res.status(201).json({
      message: 'Personalización creada exitosamente',
      customization: formattedCustomization,
    });
  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ message: 'Error al crear la personalización', error: error.message });
  }
};