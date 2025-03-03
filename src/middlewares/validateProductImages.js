// middlewares/validateProductImages.js
const multer = require('multer');

const validateProductImages = (upload) => {
  return (req, res, next) => {
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Se permiten un máximo de 10 imágenes' });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ message: 'El tamaño máximo por imagen es 5MB' });
        }
        return res.status(400).json({ message: err.message });
      }
      if (err) {
        return res.status(400).json({ message: err.message });
      }
      // Verifica que req.files esté definido y no sea un arreglo vacío
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'Debe subir al menos una imagen' });
      }
      // Añadir depuración para verificar cuántos archivos se están recibiendo
      console.log('Número de imágenes recibidas:', req.files.length);
      next();
    });
  };
};

module.exports = validateProductImages;