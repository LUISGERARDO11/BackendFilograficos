/* This JavaScript code snippet is setting up a file upload configuration using the `multer` library in
a Node.js application. Here's a breakdown of what each part of the code is doing: */
const multer = require('multer');

// Constantes de configuración
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILES = 1; // Solo un archivo por solicitud

// Configuración de almacenamiento en memoria
const storage = multer.memoryStorage();

// Configuración base de Multer
const multerConfig = {
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES,
    fieldSize: 1024 * 1024, // 1MB para campos no archivo
  },
};

// Filtros de archivo específicos
const logoFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten imágenes JPG o PNG para el logo'));
  }
};

const regulatoryFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos PDF, DOC o DOCX para documentos regulatorios'));
  }
};

// Configuraciones específicas
const uploadLogo = multer({
  ...multerConfig,
  fileFilter: logoFileFilter,
}).single('logo');

const uploadRegulatory = multer({
  ...multerConfig,
  fileFilter: regulatoryFileFilter,
}).single('file');

// Manejador de errores de Multer
const handleMulterErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: `El archivo excede el límite de ${MAX_FILE_SIZE / (1024 * 1024)}MB` });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ message: `Se excedió el límite de ${MAX_FILES} archivos` });
    }
    return res.status(400).json({ message: err.message });
  }
  if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

// Exportar configuraciones con manejo de errores
module.exports = {
  uploadLogo: [uploadLogo, handleMulterErrors],
  uploadRegulatory: [uploadRegulatory, handleMulterErrors],
};