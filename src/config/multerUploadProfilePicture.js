const multer = require('multer');
const path = require('path');

const storage = multer.memoryStorage();

const uploadProfilePicture = multer({
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
    fileSize: 2 * 1024 * 1024, // Máximo 2MB por imagen (antes de compresión)
    files: 1 // Máximo 1 imagen por solicitud
  }
}).single('profilePicture'); // Campo esperado: 'profilePicture', solo 1 archivo

module.exports = uploadProfilePicture;