/* This code snippet is setting up a middleware function for handling file uploads using the `multer`
library in a Node.js application. Here's a breakdown of what each part of the code is doing: */
const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadBannerImages = multer({
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
    fileSize: 1 * 1024 * 1024, // Máximo 1MB por imagen (antes de compresión)
    files: 5 // Máximo 5 imágenes por solicitud
  }
}).array('bannerImages', 5); // Campo esperado: 'bannerImages', máximo 5 archivos

module.exports = uploadBannerImages;