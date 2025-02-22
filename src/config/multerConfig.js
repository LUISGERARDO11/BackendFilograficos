const multer = require('multer');
const path = require('path');

// Configuración de almacenamiento
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  },
});

// Configuración de Multer
const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const filetypes = /doc|docx/;
    const mimetype = /application\/msword|application\/vnd.openxmlformats-officedocument.wordprocessingml.document/;
    const isMimetypeValid = mimetype.test(file.mimetype);
    const isExtnameValid = filetypes.test(path.extname(file.originalname).toLowerCase());
  
    if (isMimetypeValid && isExtnameValid) {
      return cb(null, true);
    }
    cb(new Error('Error: Tipo de archivo no soportado'));
  },
});
module.exports = upload;