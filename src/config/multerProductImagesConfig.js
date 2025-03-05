const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadProductImages = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpg|jpeg|png|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten imágenes en formato JPG, JPEG, PNG o WEBP'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5MB por imagen
    files: 100 // Máximo total de 100 imágenes (10 por variante, asumiendo hasta 10 variantes)
  }
}).any(); // Permite cualquier campo dinámico como variants[index][images]

module.exports = uploadProductImages;