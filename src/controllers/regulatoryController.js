const { RegulatoryDocument, DocumentVersion } = require('../models/Associations');
const loggerUtils = require('../utils/loggerUtils');
const { Op } = require('sequelize');

// Crear nuevo documento regulatorio
exports.createRegulatoryDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { title, content, effective_date } = req.body;
    
    // Buscar documento existente
    const existingDoc = await RegulatoryDocument.findOne({
      where: { 
        title,
        deleted: false
      },
      transaction
    });

    if (existingDoc) {
      // Desactivar versión actual
      await DocumentVersion.update(
        { active: false },
        { 
          where: { document_id: existingDoc.document_id, active: true },
          transaction
        }
      );

      // Crear nueva versión
      const lastVersion = await DocumentVersion.findOne({
        where: { document_id: existingDoc.document_id },
        order: [['version', 'DESC']],
        transaction
      });

      const newVersion = parseFloat(lastVersion.version) + 1.0;
      
      const newVersionEntry = await DocumentVersion.create({
        document_id: existingDoc.document_id,
        version: newVersion.toFixed(1),
        content,
        active: true,
        deleted: false
      }, { transaction });

      // Actualizar documento principal
      await existingDoc.update({
        current_version: newVersion.toFixed(1),
        effective_date: effective_date || new Date()
      }, { transaction });

      await transaction.commit();
      
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
    }, { transaction });

    await DocumentVersion.create({
      document_id: newDoc.document_id,
      version: '1.0',
      content,
      active: true,
      deleted: false
    }, { transaction });

    await transaction.commit();
    
    loggerUtils.logUserActivity(req.user.user_id, 'create', 
      `Documento creado: ${title}, versión 1.0`);
    
    return res.status(201).json({
      message: 'Documento creado exitosamente',
      document: newDoc
    });

  } catch (error) {
    await transaction.rollback();
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
  const transaction = await sequelize.transaction();
  try {
    const { document_id, version_id } = req.params;

    // Marcar versión como eliminada
    const version = await DocumentVersion.findByPk(version_id, { transaction });
    if (!version) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Versión no encontrada' });
    }

    await version.update({ 
      deleted: true,
      active: false
    }, { transaction });

    // Buscar última versión válida
    const lastValidVersion = await DocumentVersion.findOne({
      where: { 
        document_id,
        deleted: false
      },
      order: [['version', 'DESC']],
      transaction
    });

    if (!lastValidVersion) {
      await transaction.rollback();
      return res.status(400).json({ message: 'No hay versiones válidas' });
    }

    // Activar última versión
    await lastValidVersion.update({ active: true }, { transaction });
    
    // Actualizar documento principal
    await RegulatoryDocument.update({
      current_version: lastValidVersion.version
    }, {
      where: { document_id },
      transaction
    });

    await transaction.commit();
    
    loggerUtils.logUserActivity(req.user.user_id, 'delete', 
      `Versión ${version.version} eliminada. Nueva versión activa: ${lastValidVersion.version}`);
    
    res.status(200).json({
      message: `Versión ${version.version} eliminada. Versión ${lastValidVersion.version} activa`
    });

  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error eliminando versión',
      error: error.message
    });
  }
};

// Actualizar documento (nueva versión)
exports.updateRegulatoryDocument = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { document_id } = req.params;
    const { content, effective_date } = req.body;

    // Obtener versión actual
    const currentVersion = await DocumentVersion.findOne({
      where: { 
        document_id,
        active: true
      },
      transaction
    });

    if (!currentVersion) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Versión activa no encontrada' });
    }

    // Desactivar versión actual
    await currentVersion.update({ active: false }, { transaction });

    // Calcular nueva versión
    const lastVersion = await DocumentVersion.findOne({
      where: { document_id },
      order: [['version', 'DESC']],
      transaction
    });

    const newVersion = (parseFloat(lastVersion.version) + 1.0).toFixed(1);

    // Crear nueva versión
    const newVersionEntry = await DocumentVersion.create({
      document_id,
      version: newVersion,
      content,
      active: true,
      deleted: false
    }, { transaction });

    // Actualizar documento principal
    await RegulatoryDocument.update({
      current_version: newVersion,
      effective_date: effective_date || new Date()
    }, {
      where: { document_id },
      transaction
    });

    await transaction.commit();
    
    loggerUtils.logUserActivity(req.user.user_id, 'update', 
      `Documento actualizado a versión ${newVersion}`);
    
    res.status(200).json({
      message: `Versión ${newVersion} creada`,
      version: newVersionEntry
    });

  } catch (error) {
    await transaction.rollback();
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

    const document = await RegulatoryDocument.findByPk(document_id, {
      include: [{
        model: DocumentVersion,
        attributes: ['version_id', 'version', 'content', 'created_at', 'deleted']
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
  const transaction = await sequelize.transaction();
  try {
    const { version_id } = req.params;

    const version = await DocumentVersion.findByPk(version_id, { transaction });
    if (!version) {
      await transaction.rollback();
      return res.status(404).json({ message: 'Versión no encontrada' });
    }

    await version.update({ deleted: false }, { transaction });

    // Si es la última versión, activarla
    const latestVersion = await DocumentVersion.findOne({
      where: { document_id: version.document_id },
      order: [['version', 'DESC']],
      transaction
    });

    if (latestVersion.version_id === version.version_id) {
      await DocumentVersion.update(
        { active: false },
        { 
          where: { 
            document_id: version.document_id,
            active: true
          },
          transaction
        }
      );
      
      await version.update({ active: true }, { transaction });
      
      await RegulatoryDocument.update({
        current_version: version.version
      }, {
        where: { document_id: version.document_id },
        transaction
      });
    }

    await transaction.commit();
    
    loggerUtils.logUserActivity(req.user.user_id, 'restore', 
      `Versión ${version.version} restaurada`);
    
    res.status(200).json({
      message: 'Versión restaurada exitosamente',
      version
    });

  } catch (error) {
    await transaction.rollback();
    loggerUtils.logCriticalError(error);
    res.status(500).json({ 
      message: 'Error restaurando versión',
      error: error.message
    });
  }
};