/* The above code is a set of controller functions for managing regulatory documents and their
versions. Here is a summary of what each function does: */
const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { processUploadedFile, getNextVersion, updateActiveVersion, handleError } = require('../utils/regulatoryUtils');

// Determina el estado de una versión de manera clara
const getVersionStatus = (version) => {
  if (version.deleted) return 'Eliminado';
  if (version.active) return 'Vigente';
  return 'Histórico';
};

// Crear nuevo documento regulatorio
exports.createRegulatoryDocument = async (req, res) => {
  const { title, effective_date } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });

  try {
    const content = await processUploadedFile(req.file.buffer);
    const existingDoc = await RegulatoryDocument.findOne({ where: { title, deleted: false } });

    if (existingDoc) {
      const newVersion = await getNextVersion(existingDoc.document_id);
      await updateActiveVersion(existingDoc.document_id, newVersion, content, effective_date);
      loggerUtils.logUserActivity(req.user.user_id, 'update', `Documento actualizado a versión ${newVersion}`);
      return res.status(200).json({ message: `Documento actualizado a versión ${newVersion}`, document: existingDoc });
    }

    const newDoc = await RegulatoryDocument.create({
      title,
      current_version: '1.0',
      effective_date: effective_date || new Date(),
      deleted: false,
    });

    await DocumentVersion.create({
      document_id: newDoc.document_id,
      version: '1.0',
      content,
      active: true,
      deleted: false,
    });

    loggerUtils.logUserActivity(req.user.user_id, 'create', `Documento creado: ${title}, versión 1.0`);
    res.status(201).json({ message: 'Documento creado exitosamente', document: newDoc });
  } catch (error) {
    handleError(res, error, 'Error procesando documento');
  }
};

// Eliminar documento (lógico)
exports.deleteRegulatoryDocument = async (req, res) => {
  const { document_id } = req.params;
  try {
    const document = await RegulatoryDocument.findByPk(document_id);
    if (!document) return res.status(404).json({ message: 'Documento no encontrado' });

    await document.update({ deleted: true });
    loggerUtils.logUserActivity(req.user.user_id, 'delete', `Documento ${document.title} marcado como eliminado`);
    res.status(200).json({ message: 'Documento marcado como eliminado' });
  } catch (error) {
    handleError(res, error, 'Error eliminando documento');
  }
};

// Eliminar versión específica
exports.deleteRegulatoryDocumentVersion = async (req, res) => {
  const { document_id, version_id } = req.params;
  try {
    const version = await DocumentVersion.findByPk(version_id);
    if (!version || version.document_id !== parseInt(document_id)) {
      return res.status(404).json({ message: 'Versión no encontrada o no pertenece al documento' });
    }

    await version.update({ deleted: true, active: false });
    const lastValidVersion = await DocumentVersion.findOne({
      where: { document_id, deleted: false },
      order: [['version', 'DESC']],
    });

    if (!lastValidVersion) return res.status(400).json({ message: 'No hay versiones válidas restantes' });

    await lastValidVersion.update({ active: true });
    await RegulatoryDocument.update({ current_version: lastValidVersion.version }, { where: { document_id } });

    loggerUtils.logUserActivity(req.user.user_id, 'delete', 
      `Versión ${version.version} eliminada. Nueva versión activa: ${lastValidVersion.version}`);
    res.status(200).json({
      message: `Versión ${version.version} eliminada. Versión ${lastValidVersion.version} activa`,
    });
  } catch (error) {
    handleError(res, error, 'Error eliminando versión');
  }
};

// Actualizar documento (nueva versión)
exports.updateRegulatoryDocument = async (req, res) => {
  const { document_id } = req.params;
  const { effective_date } = req.body;
  if (!req.file) return res.status(400).json({ error: 'No se ha subido ningún archivo' });

  try {
    const document = await RegulatoryDocument.findByPk(document_id);
    if (!document || document.deleted) return res.status(404).json({ message: 'Documento no encontrado o eliminado' });

    const content = await processUploadedFile(req.file.buffer);
    const newVersion = await getNextVersion(document_id);
    await updateActiveVersion(document_id, newVersion, content, effective_date);

    loggerUtils.logUserActivity(req.user.user_id, 'update', `Documento actualizado a versión ${newVersion}`);
    res.status(200).json({ message: `Versión ${newVersion} creada`, version: { version: newVersion } });
  } catch (error) {
    handleError(res, error, 'Error actualizando documento');
  }
};

// Obtener todas las versiones vigentes
exports.getAllCurrentVersions = async (req, res) => {
  try {
    const documents = await RegulatoryDocument.findAll({
      where: { deleted: false },
      include: [{ model: DocumentVersion, where: { active: true }, attributes: ['version_id', 'version', 'content', 'created_at'] }],
    });

    if (!documents.length) return res.status(404).json({ message: 'No se encontraron documentos' });

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', 'Consultadas versiones vigentes');
    res.status(200).json(documents);
  } catch (error) {
    handleError(res, error, 'Error obteniendo versiones');
  }
};

// Obtener versión vigente por ID
exports.getCurrentVersionById = async (req, res) => {
  const { document_id } = req.params;
  try {
    const document = await RegulatoryDocument.findOne({
      where: { document_id, deleted: false },
      include: [{ model: DocumentVersion, where: { active: true }, attributes: ['version_id', 'version', 'content', 'created_at'] }],
    });

    if (!document) return res.status(404).json({ message: 'Documento no encontrado' });

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', `Versión vigente de documento ${document_id} consultada`);
    res.status(200).json(document);
  } catch (error) {
    handleError(res, error, 'Error obteniendo versión vigente');
  }
};

// Obtener versión vigente por título
exports.getCurrentVersion = async (req, res) => {
  const { title } = req.params;
  try {
    const document = await RegulatoryDocument.findOne({
      where: { title, deleted: false },
      include: [{ model: DocumentVersion, where: { active: true }, attributes: ['version_id', 'version', 'content', 'created_at'] }],
    });

    if (!document) return res.status(404).json({ message: 'Documento no encontrado' });

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', `Versión vigente de ${title} consultada`);
    res.status(200).json(document);
  } catch (error) {
    handleError(res, error, 'Error obteniendo versión');
  }
};

// Obtener historial de versiones
exports.getVersionHistory = async (req, res) => {
  const { document_id } = req.params;
  try {
    const document = await RegulatoryDocument.findByPk(document_id, {
      include: [{ model: DocumentVersion, where: { deleted: false }, attributes: ['version_id', 'version', 'content', 'created_at'], order: [['created_at', 'DESC']] }],
    });

    if (!document) return res.status(404).json({ message: 'Documento no encontrado' });

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', `Historial de versiones consultado para documento ${document_id}`);
    res.status(200).json(document);
  } catch (error) {
    handleError(res, error, 'Error obteniendo historial');
  }
};

// Obtener documento por ID con todas sus versiones
exports.getDocumentById = async (req, res) => {
  const { document_id } = req.params;
  try {
    const document = await RegulatoryDocument.findByPk(document_id, {
      include: [{ model: DocumentVersion, attributes: ['version_id', 'version', 'content', 'created_at', 'active', 'deleted'] }],
    });

    if (!document) return res.status(404).json({ message: 'Documento regulatorio no encontrado.' });

    const versions = document.DocumentVersions.map(version => ({
      version_id: version.version_id,
      version: version.version,
      content: version.content,
      created_at: version.created_at,
      status: getVersionStatus(version), // Uso de la función auxiliar
    }));

    const response = {
      document_id: document.document_id,
      title: document.title,
      current_version: document.current_version,
      effective_date: document.effective_date,
      versions,
    };

    loggerUtils.logUserActivity(req.user?.user_id || 'anon', 'view', `Documento con ID ${document_id} consultado`);
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error, 'Error obteniendo documento');
  }
};

// Restaurar documento
exports.restoreRegulatoryDocument = async (req, res) => {
  const { document_id } = req.params;
  try {
    const document = await RegulatoryDocument.findByPk(document_id);
    if (!document) return res.status(404).json({ message: 'Documento no encontrado' });

    await document.update({ deleted: false });
    loggerUtils.logUserActivity(req.user.user_id, 'restore', `Documento ${document.title} restaurado`);
    res.status(200).json({ message: 'Documento restaurado exitosamente', document });
  } catch (error) {
    handleError(res, error, 'Error restaurando documento');
  }
};

// Restaurar versión específica
exports.restoreRegulatoryDocumentVersion = async (req, res) => {
  const { version_id } = req.params;
  try {
    const version = await DocumentVersion.findByPk(version_id);
    if (!version) return res.status(404).json({ message: 'Versión no encontrada' });

    await version.update({ deleted: false });
    const latestVersion = await DocumentVersion.findOne({
      where: { document_id: version.document_id },
      order: [['version', 'DESC']],
    });

    if (latestVersion.version_id === version.version_id) {
      await updateActiveVersion(version.document_id, version.version, version.content, null);
    }

    loggerUtils.logUserActivity(req.user.user_id, 'restore', `Versión ${version.version} restaurada`);
    res.status(200).json({ message: 'Versión restaurada exitosamente', version });
  } catch (error) {
    handleError(res, error, 'Error restaurando versión');
  }
};