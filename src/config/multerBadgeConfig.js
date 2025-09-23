const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadBadgeIcon = multer({
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
    fileSize: 1 * 1024 * 1024, // Máximo 1MB por imagen
    files: 1 // Solo una imagen por solicitud
  }
}).single('badgeIcon'); // Campo esperado: 'badgeIcon'

module.exports = uploadBadgeIcon;