const axios = require('axios');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const he = require('he');
const cloudinaryService = require('../services/cloudinaryService');
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('./loggerUtils');

// Detectar contenido sospechoso con regex optimizadas
function isSuspiciousContent(content) {
  // Usamos patrones más estrictos y evitamos backtracking excesivo
  const suspiciousPatterns = [
    /<!DOCTYPE\s+html\s*>/i,
    /<html(?:\s+[^>]*>|>)/i,
    /<script(?:\s+[^>]*>|>)[\s\S]{0,1000}?<\/script>/i,
    /<meta(?:\s+[^>]*>|>)/i,
    /<style(?:\s+[^>]*>|>)[\s\S]{0,1000}?<\/style>/i,
    /<iframe(?:\s+[^>]*>|>)[\s\S]{0,1000}?<\/iframe>/i,
    /<object(?:\s+[^>]*>|>)[\s\S]{0,1000}?<\/object>/i,
    /<embed(?:\s+[^>]*>|>)[\s\S]{0,1000}?<\/embed>/i,
    /<link(?:\s+[^>]*>|>)/i,
  ];

  const timeoutMs = 1000; // 1 segundo
  const startTime = Date.now();
  
  return suspiciousPatterns.some(pattern => {
    if (Date.now() - startTime > timeoutMs) {
      loggerUtils.logCriticalError(new Error('Tiempo de procesamiento de regex excedido'));
      return true; // Consideramos sospechoso si excede el tiempo
    }
    return pattern.test(content);
  });
}

// Procesar archivo subido y obtener contenido limpio
async function processUploadedFile(fileBuffer) {
  let fileUrl;
  try {
    fileUrl = await cloudinaryService.uploadFilesToCloudinary(fileBuffer, { resource_type: 'raw' });
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000
    });
    const downloadedBuffer = Buffer.from(response.data, 'binary');
    const result = await mammoth.extractRawText({ buffer: downloadedBuffer });
    let content = result.value;

    if (isSuspiciousContent(content)) {
      throw new Error('El contenido del archivo es sospechoso.');
    }
    
    content = sanitizeHtml(content, { 
      allowedTags: [], 
      allowedAttributes: {},
      textFilter: text => he.decode(text)
    });

    return content.trim();
  } catch (error) {
    loggerUtils.logCriticalError(error, { 
      context: 'processUploadedFile', 
      fileUrl: fileUrl || 'unknown'
    });
    throw error; // Rethrow con logging adicional
  }
}

// Obtener la siguiente versión
async function getNextVersion(document_id) {
  const lastVersion = await DocumentVersion.findOne({
    where: { document_id, deleted: false },
    order: [['version', 'DESC']],
  });
  const lastVersionNumber = lastVersion ? parseFloat(lastVersion.version) : 0;
  return (lastVersionNumber + 1.0).toFixed(1);
}

// Actualizar versión activa
async function updateActiveVersion(document_id, newVersion, content, effective_date) {
  const transaction = await DocumentVersion.sequelize.transaction();
  try {
    await DocumentVersion.update(
      { active: false },
      { where: { document_id, active: true }, transaction }
    );
    await DocumentVersion.create({
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
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

// Manejar errores
function handleError(res, error, message = 'Error procesando solicitud') {
  loggerUtils.logCriticalError(error);
  res.status(500).json({ 
    message, 
    error: error.message,
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