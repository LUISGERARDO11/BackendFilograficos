/* The above code is a set of controller functions for managing regulatory documents and their
versions. Here is a summary of what each function does: */
const axios = require('axios'); // Importar axios para descargar el archivo
const cloudinaryService = require('../services/cloudinaryService');
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const mammoth = require('mammoth');
const sanitizeHtml = require('sanitize-html');
const he = require('he');

// Función para detectar contenido sospechoso
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

  return suspiciousPatterns.some((pattern) => pattern.test(content));
}

// Crear nuevo documento regulatorio
exports.createRegulatoryDocument = async (req, res) => {
  try {
    const { title, effective_date } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    // 1. Subir el archivo a Cloudinary
    const fileUrl = await cloudinaryService.uploadFilesToCloudinary(req.file.buffer, {
      resource_type: 'raw', // Especifica que es un archivo no binario (como .docx)
    });

    // 2. Descargar el archivo desde Cloudinary (en memoria)
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data, 'binary');

    // 3. Convertir el archivo .docx a HTML usando mammoth
    const result = await mammoth.extractRawText({ buffer: fileBuffer }); // Usar buffer en lugar de path
    let originalContent = result.value;
    let iteration = 0;
    let previousContent = '';
    let contentsContentSuspicious = false;

    // 4. Ciclo para limpiar y verificar contenido
    do {
      iteration++;
      previousContent = originalContent;
      contentsContentSuspicious = isSuspiciousContent(originalContent);
      if (contentsContentSuspicious) {
        break;
      }

      originalContent = sanitizeHtml(originalContent, {
        allowedTags: [],
        allowedAttributes: {},
      });
      originalContent = he.decode(originalContent);
    } while (iteration < 10);

    if (contentsContentSuspicious) {
      return res.status(400).json({ error: 'El contenido del archivo es sospechoso.' });
    }

    // 5. Buscar documento existente
    const existingDoc = await RegulatoryDocument.findOne({
      where: {
        title,
        deleted: false
      }
    });

    if (existingDoc) {
      // Desactivar versión actual
      await DocumentVersion.update(
        { active: false },
        {
          where: { document_id: existingDoc.document_id, active: true }
        }
      );

      // Crear nueva versión
      const lastVersion = await DocumentVersion.findOne({
        where: { document_id: existingDoc.document_id },
        order: [['version', 'DESC']]
      });

      const newVersion = parseFloat(lastVersion.version) + 1.0;

      const newVersionEntry = await DocumentVersion.create({
        document_id: existingDoc.document_id,
        version: newVersion.toFixed(1),
        content: originalContent,
        active: true,
        deleted: false
      });

      // Actualizar documento principal
      await existingDoc.update({
        current_version: newVersion.toFixed(1),
        effective_date: effective_date || new Date()
      });

      loggerUtils.logUserActivity(req.user.user_id, 'update',
        `Documento actualizado a versión ${newVersion.toFixed(1)}`);

      return res.status(200).json({
        message: `Documento actualizado a versión ${newVersion.toFixed(1)}`,
        document: existingDoc
      });
    }

    // Crear nuevo documento
    const newDoc = await RegulatoryDocument.create({
      title,
      current_version: '1.0',
      effective_date: effective_date || new Date(),
      deleted: false
    });

    await DocumentVersion.create({
      document_id: newDoc.document_id,
      version: '1.0',
      content: originalContent,
      active: true,
      deleted: false
    });

    loggerUtils.logUserActivity(req.user.user_id, 'create',
      `Documento creado: ${title}, versión 1.0`);

    return res.status(201).json({
      message: 'Documento creado exitosamente',
      document: newDoc
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({
      message: 'Error procesando documento',
      error: error.message
    });
  }
};

// Eliminar documento (lógico)
exports.deleteRegulatoryDocument = async (req, res) => {
  const { document_id } = req.params;

  try {
    const document = await RegulatoryDocument.findByPk(document_id);
    
    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    await document.update({ deleted: true });
    
    loggerUtils.logUserActivity(req.user.user_id, 'delete', 
      `Documento ${document.title} marcado como eliminado`);
    
    res.status(200).json({ 
      message: 'Documento marcado como eliminado'
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error eliminando documento',
      error: error.message
    });
  }
};

// Eliminar versión específica
exports.deleteRegulatoryDocumentVersion = async (req, res) => {
  try {
    const { document_id, version_id } = req.params;

    // Marcar versión como eliminada
    const version = await DocumentVersion.findByPk(version_id);
    if (!version) {
      return res.status(404).json({ message: 'Versión no encontrada' });
    }

    await version.update({ 
      deleted: true,
      active: false
    });

    // Buscar última versión válida
    const lastValidVersion = await DocumentVersion.findOne({
      where: { 
        document_id,
        deleted: false
      },
      order: [['version', 'DESC']]
    });

    if (!lastValidVersion) {
      return res.status(400).json({ message: 'No hay versiones válidas' });
    }

    // Activar última versión
    await lastValidVersion.update({ active: true });
    
    // Actualizar documento principal
    await RegulatoryDocument.update({
      current_version: lastValidVersion.version
    }, {
      where: { document_id }
    });
    
    loggerUtils.logUserActivity(req.user.user_id, 'delete', 
      `Versión ${version.version} eliminada. Nueva versión activa: ${lastValidVersion.version}`);
    
    res.status(200).json({
      message: `Versión ${version.version} eliminada. Versión ${lastValidVersion.version} activa`
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error eliminando versión',
      error: error.message
    });
  }
};

// Actualizar documento (nueva versión)
exports.updateRegulatoryDocument = async (req, res) => {
  try {
    const { document_id } = req.params;
    const { effective_date } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo' });
    }

    // 1. Subir el archivo a Cloudinary
    const fileUrl = await cloudinaryService.uploadFilesToCloudinary(req.file.buffer, {
      resource_type: 'raw', // Especifica que es un archivo no binario (como .docx)
    });

    // 2. Descargar el archivo desde Cloudinary (en memoria)
    const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(response.data, 'binary');

    // 3. Convertir el archivo .docx a HTML usando mammoth
    const result = await mammoth.extractRawText({ buffer: fileBuffer }); // Usar buffer en lugar de path
    let originalContent = result.value;
    let iteration = 0;
    let previousContent = '';
    let contentsContentSuspicious = false;

    // 4. Ciclo para limpiar y verificar contenido
    do {
      iteration++;
      previousContent = originalContent;
      contentsContentSuspicious = isSuspiciousContent(originalContent);
      if (contentsContentSuspicious) {
        break;
      }

      originalContent = sanitizeHtml(originalContent, {
        allowedTags: [],
        allowedAttributes: {},
      });
      originalContent = he.decode(originalContent);
    } while (iteration < 10);

    if (contentsContentSuspicious) {
      return res.status(400).json({ error: 'El contenido del archivo es sospechoso.' });
    }

    // 5. Obtener versión actual
    const currentVersion = await DocumentVersion.findOne({
      where: { 
        document_id,
        active: true
      }
    });

    if (!currentVersion) {
      return res.status(404).json({ message: 'Versión activa no encontrada' });
    }

    // 6. Desactivar versión actual
    await currentVersion.update({ active: false });

    // 7. Calcular nueva versión
    const lastVersion = await DocumentVersion.findOne({
      where: { document_id },
      order: [['version', 'DESC']]
    });

    const newVersion = (parseFloat(lastVersion.version) + 1.0).toFixed(1);

    // 8. Crear nueva versión
    const newVersionEntry = await DocumentVersion.create({
      document_id,
      version: newVersion,
      content: originalContent,
      active: true,
      deleted: false
    });

    // 9. Actualizar documento principal
    await RegulatoryDocument.update({
      current_version: newVersion,
      effective_date: effective_date || new Date()
    }, {
      where: { document_id }
    });
    
    loggerUtils.logUserActivity(req.user.user_id, 'update', 
      `Documento actualizado a versión ${newVersion}`);
    
    res.status(200).json({
      message: `Versión ${newVersion} creada`,
      version: newVersionEntry
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error actualizando documento',
      error: error.message
    });
  }
};

// Obtener todas las versiones vigentes
exports.getAllCurrentVersions = async (req, res) => {
  try {
    const documents = await RegulatoryDocument.findAll({
      where: { deleted: false },
      include: [{
        model: DocumentVersion,
        where: { active: true },
        attributes: ['version_id', 'version', 'content', 'created_at']
      }]
    });

    if (!documents.length) {
      return res.status(404).json({ message: 'No se encontraron documentos' });
    }

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 
      'Consultadas versiones vigentes');
    
    res.status(200).json(documents);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error obteniendo versiones',
      error: error.message
    });
  }
};

// Obtener versión vigente de un documento por ID
exports.getCurrentVersionById = async (req, res) => {
  try {
    const { document_id } = req.params;

    const document = await RegulatoryDocument.findOne({
      where: { 
        document_id,
        deleted: false
      },
      include: [{
        model: DocumentVersion,
        where: { active: true },
        attributes: ['version_id', 'version', 'content', 'created_at']
      }]
    });

    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 
      `Versión vigente de documento ${document_id} consultada`);
    
    res.status(200).json(document);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error obteniendo versión vigente',
      error: error.message
    });
  }
};

// Obtener versión vigente de un documento
exports.getCurrentVersion = async (req, res) => {
  try {
    const { title } = req.params;

    const document = await RegulatoryDocument.findOne({
      where: { 
        title,
        deleted: false
      },
      include: [{
        model: DocumentVersion,
        where: { active: true },
        attributes: ['version_id', 'version', 'content', 'created_at']
      }]
    });

    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 
      `Versión vigente de ${title} consultada`);
    
    res.status(200).json(document);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error obteniendo versión',
      error: error.message
    });
  }
};

// Obtener historial de versiones
exports.getVersionHistory = async (req, res) => {
  try {
    const { document_id } = req.params;

    // Buscar el documento con sus versiones no eliminadas y ordenadas
    const document = await RegulatoryDocument.findByPk(document_id, {
      include: [{
        model: DocumentVersion,
        where: { deleted: false }, // Solo versiones no eliminadas
        attributes: ['version_id', 'version', 'content', 'created_at'],
        order: [['created_at', 'DESC']] // Ordenar por fecha de creación (más reciente primero)
      }]
    });

    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 
      `Historial de versiones consultado para documento ${document_id}`);
    
    res.status(200).json(document);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error obteniendo historial',
      error: error.message
    });
  }
};

// Obtener documento por ID con todas sus versiones
exports.getDocumentById = async (req, res) => {
  try {
    const { document_id } = req.params;

    const document = await RegulatoryDocument.findByPk(document_id, {
      include: [{
        model: DocumentVersion,
        attributes: ['version_id', 'version', 'content', 'created_at', 'active', 'deleted']
      }]
    });

    if (!document) {
      return res.status(404).json({ message: 'Documento regulatorio no encontrado.' });
    }

    // Registrar acceso
    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 
      `Documento con ID ${document_id} consultado`);

    // Mapear respuesta
    const response = {
      document_id: document.document_id,
      title: document.title,
      current_version: document.current_version,
      effective_date: document.effective_date,
      versions: document.DocumentVersions.map(version => ({
        version_id: version.version_id,
        version: version.version,
        content: version.content,
        created_at: version.created_at,
        status: version.deleted ? 'Eliminado' : (version.active ? 'Vigente' : 'Histórico')
      }))
    };

    res.status(200).json(response);

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error obteniendo documento',
      error: error.message
    });
  }
};

// Restaurar documento
exports.restoreRegulatoryDocument = async (req, res) => {
  try {
    const { document_id } = req.params;

    const document = await RegulatoryDocument.findByPk(document_id);
    if (!document) {
      return res.status(404).json({ message: 'Documento no encontrado' });
    }

    await document.update({ deleted: false });
    
    loggerUtils.logUserActivity(req.user.user_id, 'restore', 
      `Documento ${document.title} restaurado`);
    
    res.status(200).json({
      message: 'Documento restaurado exitosamente',
      document
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error restaurando documento',
      error: error.message
    });
  }
};

// Restaurar versión específica
exports.restoreRegulatoryDocumentVersion = async (req, res) => {
  try {
    const { version_id } = req.params;

    const version = await DocumentVersion.findByPk(version_id);
    if (!version) {
      return res.status(404).json({ message: 'Versión no encontrada' });
    }

    await version.update({ deleted: false });

    // Si es la última versión, activarla
    const latestVersion = await DocumentVersion.findOne({
      where: { document_id: version.document_id },
      order: [['version', 'DESC']]
    });

    if (latestVersion.version_id === version.version_id) {
      await DocumentVersion.update(
        { active: false },
        { 
          where: { 
            document_id: version.document_id,
            active: true
          }
        }
      );
      
      await version.update({ active: true });
      
      await RegulatoryDocument.update({
        current_version: version.version
      }, {
        where: { document_id: version.document_id }
      });
    }
    
    loggerUtils.logUserActivity(req.user.user_id, 'restore', 
      `Versión ${version.version} restaurada`);
    
    res.status(200).json({
      message: 'Versión restaurada exitosamente',
      version
    });

  } catch (error) {
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error restaurando versión',
      error: error.message
    });
  }
};