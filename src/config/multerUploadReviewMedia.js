const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadReviewMedia = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /jpg|jpeg|png|webp|mp4|mov/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Solo se permiten imágenes (JPG, JPEG, PNG, WEBP) o videos (MP4, MOV)'));
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5MB por archivo
    files: 5 // Máximo 5 archivos por solicitud
  }
}).array('reviewMedia', 5); // Campo esperado: 'reviewMedia', máximo 5 archivos

module.exports = uploadReviewMedia;