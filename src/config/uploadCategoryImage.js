const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadCategoryImage = multer({
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
    fileSize: 2 * 1024 * 1024, // Máximo 2MB por imagen
    files: 1 // Máximo 1 imagen por solicitud
  }
}).single('categoryImage'); // Campo esperado: 'categoryImage', solo un archivo

module.exports = uploadCategoryImage;