/* This JavaScript code defines a module that validates product images based on certain criteria.
Here's a breakdown of what each part of the code is doing: */
const multer = require('multer');

// Función auxiliar para contar imágenes por variante
const countImagesByVariant = (files) => {
  const imagesByVariant = {};
  files.forEach(file => {
    const match = file.fieldname.match(/variants\[(\d+)\]\[images\]/);
    if (match) {
      const index = parseInt(match[1], 10);
      imagesByVariant[index] = (imagesByVariant[index] || 0) + 1;
    }
  });
  return imagesByVariant;
};

// Función auxiliar para parsear variantes desde el cuerpo de la solicitud
const parseVariants = (variantsBody, res) => {
  try {
    return variantsBody ? JSON.parse(variantsBody) : [];
  } catch (error) {
    res.status(400).json({ message: 'El campo variants debe ser un arreglo JSON válido' });
    return null;
  }
};

// Validar imágenes por variante
const validateImagesForVariants = (variants, imagesByVariant, res) => {
  for (let i = 0; i < variants.length; i++) {
    const imageCount = imagesByVariant[i] || 0;
    if (imageCount < 1) {
      res.status(400).json({ message: `La variante ${variants[i].sku} debe tener al menos 1 imagen` });
      return false;
    }
    if (imageCount > 10) {
      res.status(400).json({ message: `La variante ${variants[i].sku} no puede tener más de 10 imágenes` });
      return false;
    }
  }
  return true;
};

// Validar nuevas variantes sin imágenes
const validateNewVariantsWithoutImages = (variants, res) => {
  const hasNewVariants = variants.some(v => !v.variant_id);
  if (hasNewVariants) {
    res.status(400).json({ message: 'Debe subir al menos una imagen para nuevas variantes' });
    return false;
  }
  return true;
};

// Nueva función extraída para manejar el caso con archivos
const handleFilesCase = (req, res) => {
  const imagesByVariant = countImagesByVariant(req.files);
  const variants = parseVariants(req.body.variants, res);
  if (!variants) return false;

  if (variants.length > 0) {
    return validateImagesForVariants(variants, imagesByVariant, res);
  }
  console.log('Imágenes por variante:', imagesByVariant);
  console.log('Número total de imágenes recibidas:', req.files.length);
  return true;
};

// Nueva función extraída para manejar el caso sin archivos
const handleNoFilesCase = (req, res) => {
  const variants = parseVariants(req.body.variants, res);
  if (!variants) return false;
  return validateNewVariantsWithoutImages(variants, res);
};

const validateProductImages = (req, res, next) => {
  // Si no hay archivos ni variantes, permitir actualización parcial
  if ((!req.files || req.files.length === 0) && !req.body.variants) {
    return next();
  }

  // Caso 1: Hay archivos (imágenes) enviados
  if (req.files && req.files.length > 0) {
    if (!handleFilesCase(req, res)) return;
  }
  // Caso 2: Hay variantes pero no imágenes
  else if (req.body.variants) {
    if (!handleNoFilesCase(req, res)) return;
  }

  next();
};

module.exports = validateProductImages;