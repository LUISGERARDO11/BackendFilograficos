const multer = require('multer');

const validateProductImages = (req, res, next) => {
  // Validar que haya imágenes y que cada variante tenga entre 1 y 10
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: 'Debe subir al menos una imagen por variante' });
  }

  // Parsear las variantes desde req.body para contar cuántas hay
  let variants;
  try {
    variants = JSON.parse(req.body.variants || '[]');
  } catch (error) {
    return res.status(400).json({ message: 'El campo variants debe ser un arreglo JSON válido' });
  }

  if (variants.length === 0) {
    return res.status(400).json({ message: 'Debe proporcionar al menos una variante' });
  }

  // Contar imágenes por variante
  const imagesByVariant = {};
  req.files.forEach(file => {
    const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
    if (match) {
      const index = parseInt(match[1], 10);
      imagesByVariant[index] = (imagesByVariant[index] || 0) + 1;
    }
  });

  // Validar cada variante
  for (let i = 0; i < variants.length; i++) {
    const imageCount = imagesByVariant[i] || 0;
    if (imageCount < 1) {
      return res.status(400).json({ message: `La variante ${variants[i].sku} debe tener al menos 1 imagen` });
    }
    if (imageCount > 10) {
      return res.status(400).json({ message: `La variante ${variants[i].sku} no puede tener más de 10 imágenes` });
    }
  }

  // Depuración
  console.log('Imágenes por variante:', imagesByVariant);
  console.log('Número total de imágenes recibidas:', req.files.length);

  next();
};

module.exports = validateProductImages;