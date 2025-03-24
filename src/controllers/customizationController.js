const { Customization, CustomizationOption } = require('../models');

// Obtener las opciones de personalización para un producto
exports.getCustomizationOptions = async (req, res) => {
  try {
    const { productId } = req.params;
    const options = await CustomizationOption.findAll({
      where: { product_id: productId },
    });
    if (!options || options.length === 0) {
      return res.status(404).json({ message: 'No se encontraron opciones de personalización para este producto' });
    }
    res.status(200).json(options);
  } catch (error) {
    console.error('Error al obtener opciones de personalización:', error);
    res.status(500).json({ message: 'Error al obtener opciones de personalización', error: error.message });
  }
};

// Crear una personalización para un producto
exports.createCustomization = async (req, res) => {
  try {
    const { productId, optionType, content, fileUrl, comments } = req.body;

    // Validar que el producto exista (opcional, pero recomendado)
    const customizationOption = await CustomizationOption.findOne({
      where: { product_id: productId, option_type: optionType },
    });
    if (!customizationOption) {
      return res.status(400).json({ message: 'Opción de personalización no válida para este producto' });
    }

    // Crear la personalización
    const customization = await Customization.create({
      product_id: productId,
      option_type: optionType,
      content: content || null,
      file_url: fileUrl || null,
      comments: comments || null,
      status: 'initial',
      revision_count: 0,
    });

    res.status(201).json({ message: 'Personalización creada exitosamente', customization });
  } catch (error) {
    console.error('Error al crear personalización:', error);
    res.status(500).json({ message: 'Error al crear personalización', error: error.message });
  }
};