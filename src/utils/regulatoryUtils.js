const axios = require('axios');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const he = require('he');
const cloudinaryService = require('../services/cloudinaryService');
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('./loggerUtils');

// Detectar contenido sospechoso
function isSuspiciousContent(content) {
  const suspiciousPatterns = [
    /<!DOCTYPE html>/i,
    /<html.*?>/i,
    /<script.*?>.*?<\/script>/i,
    /<meta.*?>/i,
    /<style.*?>.*?<\/style>/i,
    /<iframe.*?>.*?<\/iframe>/i,
    /<object.*?>.*?<\/object>/i,
    /<embed.*?>.*?<\/embed>/i,
    /<link.*?>/i,
  ];
  return suspiciousPatterns.some(pattern => pattern.test(content));
}

// Procesar archivo subido y obtener contenido limpio
async function processUploadedFile(fileBuffer) {
  const fileUrl = await cloudinaryService.uploadFilesToCloudinary(fileBuffer, { resource_type: 'raw' });
  const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
  const downloadedBuffer = Buffer.from(response.data, 'binary');
  const result = await mammoth.extractRawText({ buffer: downloadedBuffer });
  let content = result.value;

  for (let i = 0; i < 10; i++) {
    if (isSuspiciousContent(content)) {
      throw new Error('El contenido del archivo es sospechoso.');
    }
    content = sanitizeHtml(content, { allowedTags: [], allowedAttributes: {} });
    content = he.decode(content);
  }

  return content;
}

// Obtener la siguiente versión
async function getNextVersion(document_id) {
  const lastVersion = await DocumentVersion.findOne({
    where: { document_id },
    order: [['version', 'DESC']],
  });
  return lastVersion ? (parseFloat(lastVersion.version) + 1.0).toFixed(1) : '1.0';
}

// Actualizar versión activa
async function updateActiveVersion(document_id, newVersion, content, effective_date) {
  await DocumentVersion.update(
    { active: false },
    { where: { document_id, active: true } }
  );
  await DocumentVersion.create({
    document_id,
    version: newVersion,
    content,
    active: true,
    deleted: false,
  });
  await RegulatoryDocument.update(
    { current_version: newVersion, effective_date: effective_date || new Date() },
    { where: { document_id } }
  );
}

// Manejar errores
function handleError(res, error, message = 'Error procesando solicitud') {
  loggerUtils.logCriticalError(error);
  res.status(500).json({ message, error: error.message });
}

module.exports = {
  isSuspiciousContent,
  processUploadedFile,
  getNextVersion,
  updateActiveVersion,
  handleError,
};