const axios = require('axios');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const he = require('he');
const cloudinaryService = require('../services/cloudinaryService');
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('./loggerUtils');

// Detectar contenido sospechoso con regex más seguras
function isSuspiciousContent(content) {
  // Usamos patrones más específicos y evitamos .*? para prevenir backtracking
  const suspiciousPatterns = [
    /<!DOCTYPE\s+html\s*>/i,
    /<html(?:\s+[^>]*)?>/i,
    /<script(?:\s+[^>]*)?>[\s\S]*?<\/script>/i,
    /<meta(?:\s+[^>]*)?>/i,
    /<style(?:\s+[^>]*)?>[\s\S]*?<\/style>/i,
    /<iframe(?:\s+[^>]*)?>[\s\S]*?<\/iframe>/i,
    /<object(?:\s+[^>]*)?>[\s\S]*?<\/object>/i,
    /<embed(?:\s+[^>]*)?>[\s\S]*?<\/embed>/i,
    /<link(?:\s+[^>]*)?>/i,
  ];

  // Agregamos un límite de tiempo para prevenir DoS
  const timeoutMs = 1000; // 1 segundo
  const startTime = Date.now();
  
  const result = suspiciousPatterns.some(pattern => {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error('Tiempo de procesamiento de regex excedido');
    }
    return pattern.test(content);
  });

  return result;
}

// Procesar archivo subido y obtener contenido limpio
async function processUploadedFile(fileBuffer) {
  try {
    const fileUrl = await cloudinaryService.uploadFilesToCloudinary(fileBuffer, { resource_type: 'raw' });
    const response = await axios.get(fileUrl, { 
      responseType: 'arraybuffer',
      timeout: 10000 // Timeout de 10 segundos para la solicitud
    });
    const downloadedBuffer = Buffer.from(response.data, 'binary');
    const result = await mammoth.extractRawText({ buffer: downloadedBuffer });
    let content = result.value;

    // Reducimos las iteraciones y optimizamos la sanitización
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
    throw error;
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