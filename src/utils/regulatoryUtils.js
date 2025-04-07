const axios = require('axios');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const he = require('he');
const crypto = require('crypto'); // Módulo criptográfico seguro
const cloudinaryService = require('../services/cloudinaryService');
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('./loggerUtils');

// Configuración de límites para protección contra DoS
const REGEX_TIMEOUT_MS = 500; // Tiempo máximo para ejecución de regex
const MAX_INPUT_LENGTH = 100000; // Máximo 100KB de contenido a analizar

// Patrones optimizados para evitar backtracking catastrófico
const SUSPICIOUS_PATTERNS = [
  // Patrones más seguros usando alternativas no backtracking
  // Se eliminó el escape innecesario del !
  /<!?doctype\s+html\s*>/i,
  /<html[\s>]/i,
  /<script[\s>][^]*?<\/script\s*>/i,
  /<meta[\s>]/i,
  /<style[\s>][^]*?<\/style\s*>/i,
  /<iframe[\s>][^]*?<\/iframe\s*>/i,
  /<object[\s>][^]*?<\/object\s*>/i,
  /<embed[\s>][^]*?<\/embed\s*>/i,
  /<link[\s>]/i,
];

// Función segura para detectar contenido sospechoso
function isSuspiciousContent(content) {
  // Verificación de longitud primero
  if (content.length > MAX_INPUT_LENGTH) {
    loggerUtils.logWarning('Contenido excede tamaño máximo permitido');
    return true;
  }

  const startTime = Date.now();
  
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (Date.now() - startTime > REGEX_TIMEOUT_MS) {
      loggerUtils.logCriticalError(new Error('Tiempo de procesamiento de regex excedido'));
      return true;
    }
    
    try {
      // Usamos una implementación más segura con límite de tiempo
      if (safeRegexTest(pattern, content, startTime)) {
        return true;
      }
    } catch (error) {
      loggerUtils.logWarning(`Error en regex: ${error.message}`);
      return true;
    }
  }
  
  return false;
}

// Implementación segura de test de regex con timeout
function safeRegexTest(pattern, content, startTime) {
  const regex = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
  const match = regex.exec(content);
  
  if (Date.now() - startTime > REGEX_TIMEOUT_MS) {
    throw new Error('Regex timeout');
  }
  
  return match !== null;
}

// Procesar archivo subido con mejores prácticas de seguridad
async function processUploadedFile(fileBuffer) {
  let fileUrl;
  try {
    // Validación de tamaño del buffer primero
    if (fileBuffer.length > MAX_INPUT_LENGTH) {
      throw new Error(`El archivo excede el tamaño máximo permitido de ${MAX_INPUT_LENGTH} bytes`);
    }

    fileUrl = await cloudinaryService.uploadFilesToCloudinary(fileBuffer, { 
      resource_type: 'raw',
      timeout: 10000 
    });
    
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: MAX_INPUT_LENGTH
    });
    
    if (response.data.length > MAX_INPUT_LENGTH) {
      throw new Error('El contenido descargado excede el tamaño máximo permitido');
    }

    const downloadedBuffer = Buffer.from(response.data, 'binary');
    const result = await mammoth.extractRawText({ buffer: downloadedBuffer });
    let content = result.value;

    if (isSuspiciousContent(content)) {
      throw new Error('El contenido del archivo es sospechoso y no puede ser procesado.');
    }
    
    // Sanitización más estricta
    content = sanitizeHtml(content, { 
      allowedTags: [], 
      allowedAttributes: {},
      textFilter: text => he.decode(text),
      allowedIframeHostnames: [] // No permitir iframes
    });

    return content.trim();
  } catch (error) {
    loggerUtils.logCriticalError(error, { 
      context: 'processUploadedFile', 
      fileUrl: fileUrl || 'unknown',
      stack: error.stack 
    });
    throw error;
  }
}

// Resto de las funciones permanecen igual pero con mejor manejo de errores
async function getNextVersion(document_id) {
  try {
    const lastVersion = await DocumentVersion.findOne({
      where: { document_id, deleted: false },
      order: [['version', 'DESC']],
    });
    const lastVersionNumber = lastVersion ? parseFloat(lastVersion.version) : 0;
    return (lastVersionNumber + 1.0).toFixed(1);
  } catch (error) {
    loggerUtils.logError(error, { context: 'getNextVersion', document_id });
    throw error;
  }
}

// Actualizar versión activa
async function updateActiveVersion(document_id, newVersion, content, effective_date) {
  const transaction = await DocumentVersion.sequelize.transaction();
  try {
    await DocumentVersion.update(
      { active: false },
      { where: { document_id, active: true }, transaction }
    );
    
    const newDocVersion = await DocumentVersion.create({
      document_id,
      version: newVersion,
      content,
      active: true,
      deleted: false,
    }, { transaction });
    
    await RegulatoryDocument.update(
      { current_version: newVersion, effective_date: effective_date || new Date() },
      { where: { document_id }, transaction }
    );
    
    await transaction.commit();
    return newDocVersion;
  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error, {
      context: 'updateActiveVersion',
      document_id,
      newVersion
    });
    throw error;
  }
}

// Manejar errores
function handleError(res, error, message = 'Error procesando solicitud') {
  // Reemplazamos Math.random() con un generador criptográficamente seguro
  const errorId = crypto.randomBytes(4).toString('hex'); // 8 caracteres hexadecimales
  
  loggerUtils.logCriticalError(error, { errorId });
  
  res.status(500).json({ 
    message, 
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    errorId,
    timestamp: new Date().toISOString()
  });
}

module.exports = {
  isSuspiciousContent,
  processUploadedFile,
  getNextVersion,
  updateActiveVersion,
  handleError,
};