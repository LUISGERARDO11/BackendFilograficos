const multer = require('multer');

const validateProductImages = (req, res, next) => {
  // Si no hay archivos ni variantes en el cuerpo, permitir la actualización parcial
  if ((!req.files || req.files.length === 0) && !req.body.variants) {
    return next(); // Continúa sin validar imágenes
  }

  // Validar que haya imágenes si se están enviando archivos o variantes
  if (req.files && req.files.length > 0) {
    // Contar imágenes por variante
    const imagesByVariant = {};
    req.files.forEach(file => {
      const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
      if (match) {
        const index = parseInt(match[1], 10);
        imagesByVariant[index] = (imagesByVariant[index] || 0) + 1;
      }
    });

    // Parsear las variantes desde req.body
    let variants;
    try {
      variants = req.body.variants ? JSON.parse(req.body.variants) : [];
    } catch (error) {
      return res.status(400).json({ message: 'El campo variants debe ser un arreglo JSON válido' });
    }

    if (variants.length > 0) {
      for (let i = 0; i < variants.length; i++) {
        const imageCount = imagesByVariant[i] || 0;
        if (imageCount < 1) {
          return res.status(400).json({ message: `La variante ${variants[i].sku} debe tener al menos 1 imagen` });
        }
        if (imageCount > 10) {
          return res.status(400).json({ message: `La variante ${variants[i].sku} no puede tener más de 10 imágenes` });
        }
      }
    }

    console.log('Imágenes por variante:', imagesByVariant);
    console.log('Número total de imágenes recibidas:', req.files.length);
  } else if (req.body.variants) {
    // Si se envían variantes sin imágenes, verificar que no sean nuevas variantes
    let variants;
    try {
      variants = JSON.parse(req.body.variants);
    } catch (error) {
      return res.status(400).json({ message: 'El campo variants debe ser un arreglo JSON válido' });
    }

    const hasNewVariants = variants.some(v => !v.variant_id);
    if (hasNewVariants) {
      return res.status(400).json({ message: 'Debe subir al menos una imagen para nuevas variantes' });
    }
  }

  next();
};

module.exports = validateProductImages;