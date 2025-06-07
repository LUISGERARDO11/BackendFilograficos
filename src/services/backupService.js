require('dotenv').config();
const { google } = require('googleapis');
const crypto = require('crypto');
const { exec } = require('child_process');
const zlib = require('zlib');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const { BackupConfig, BackupLog, BackupFiles, RestorationLog, SystemConfig } = require('../models/Associations');

// Configuración de OAuth2 para Google Drive
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Directorio temporal para archivos (compatible con Windows)
const TEMP_DIR = path.join('C:\\Users\\luis3\\PRYFILOGRAFICOS\\BackendFilograficos\\temp');
const ENCRYPTION_ALGORITHM = 'aes-256-cbc';

// Asegurar que el directorio temporal exista
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
  } catch (error) {
    throw new Error(`Error creando directorio temporal: ${error.message}`);
  }
}

// Generar URL de autorización OAuth2
async function getAuthUrl() {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
}

// Manejar callback de OAuth2
async function handleOAuthCallback(code, adminId) {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Crear carpeta principal en Google Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderMetadata = {
      name: 'FilograficosBackups',
      mimeType: 'application/vnd.google-apps.folder'
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    // Crear subcarpetas para cada tipo de respaldo
    const subfolders = ['full', 'diff', 'txn'];
    const subfolderIds = {};
    for (const subfolder of subfolders) {
      const subfolderMetadata = {
        name: subfolder,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [folder.data.id]
      };
      const subfolderResult = await drive.files.create({
        resource: subfolderMetadata,
        fields: 'id'
      });
      subfolderIds[subfolder] = subfolderResult.data.id;
    }

    // Encriptar refresh token
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
      iv
    );
    let encryptedToken = cipher.update(tokens.refresh_token, 'utf8', 'hex');
    encryptedToken += cipher.final('hex');
    const encryptedTokenWithIv = iv.toString('hex') + ':' + encryptedToken;

    // Crear o actualizar configuraciones para cada tipo de respaldo
    const backupTypeMap = {
      full: 'full',
      differential: 'diff',
      transactional: 'txn'
    };
    const defaultDataTypes = {
      full: ['all'],
      differential: ['all'],
      transactional: ['all']
    };
    const defaultFrequencies = {
      full: 'weekly',
      differential: 'daily',
      transactional: 'hourly'
    };
    for (const backupType of ['full', 'differential', 'transactional']) {
      const subfolderName = backupTypeMap[backupType];
      const existingConfig = await BackupConfig.findOne({ 
        where: { storage_type: 'google_drive', backup_type: backupType } 
      });
      if (existingConfig) {
        await existingConfig.update({
          refresh_token: encryptedTokenWithIv,
          folder_id: subfolderIds[subfolderName],
          created_by: adminId,
          data_types: JSON.stringify(defaultDataTypes[backupType])
        });
      } else {
        await BackupConfig.create({
          backup_type: backupType,
          frequency: defaultFrequencies[backupType],
          data_types: JSON.stringify(defaultDataTypes[backupType]),
          storage_type: 'google_drive',
          refresh_token: encryptedTokenWithIv,
          folder_id: subfolderIds[subfolderName],
          schedule_time: '00:00:00',
          created_by: adminId
        });
      }
    }

    return folder.data.id;
  } catch (error) {
    throw new Error(`Error en callback OAuth2: ${error.message}`);
  }
}

// Obtener cliente autenticado de Drive
async function getDriveClient() {
  const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: 'full' } });
  if (!config) throw new Error('No hay configuración de Google Drive');

  // Desencriptar refresh token
  const [ivHex, encryptedToken] = config.refresh_token.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
    iv
  );
  let decryptedToken = decipher.update(encryptedToken, 'hex', 'utf8');
  decryptedToken += decipher.final('utf8');

  oauth2Client.setCredentials({ refresh_token: decryptedToken });
  await oauth2Client.refreshAccessToken();
  return google.drive({ version: 'v3', auth: oauth2Client });
}

// Obtener configuración por tipo
async function getConfig(backupType) {
  const config = await BackupConfig.findOne({ 
    where: { storage_type: 'google_drive', backup_type: backupType } 
  });
  if (config) {
    return {
      ...config.toJSON(),
      data_types: config.data_types // Usamos directamente data_types, ya que es un arreglo
    };
  }
  return null;
}

// Generar respaldo
async function generateBackup(adminId, dataTypes, backupType) {
  await ensureTempDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupFileName, tempSqlPath, tempEncryptedPath, tempCompressedPath;
  const sslCaPath = path.join(TEMP_DIR, 'ca.pem');

  try {
    // Configuración según tipo de respaldo
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: backupType } });
    if (!config) throw new Error(`No hay configuración para respaldo ${backupType}`);

    // Generar nombres de archivo según tipo
    backupFileName = `${backupType}_backup_${timestamp}.sql`;
    tempSqlPath = path.join(TEMP_DIR, backupFileName);
    tempEncryptedPath = path.join(TEMP_DIR, `${backupFileName}.enc`);
    tempCompressedPath = path.join(TEMP_DIR, `${backupFileName}.gz`);

    // Generar respaldo
    await fs.writeFile(sslCaPath, process.env.DB_SSL_CA); // Usar DB_SSL_CA en lugar de DB_SSL_CA_PATH

    // Configurar mysqldump según el tipo de respaldo
    let mysqldumpOptions;
    if (backupType === 'full') {
      mysqldumpOptions = '--single-transaction --set-gtid-purged=OFF';
    } else if (backupType === 'differential') {
      mysqldumpOptions = '--no-create-info --set-gtid-purged=OFF';
    } else if (backupType === 'transactional') {
      mysqldumpOptions = '--no-create-db --no-create-info --skip-triggers --set-gtid-purged=OFF';
    }

    // Usar credenciales desde process.env y el nombre correcto de la base de datos
    const mysqldumpCmd = `mysqldump -u${process.env.DB_USER} -p${process.env.DB_PASSWORD} -h${process.env.DB_HOST} -P${process.env.DB_PORT} --ssl-ca="${sslCaPath}" ${mysqldumpOptions} ${process.env.DB_NAME} > "${tempSqlPath}"`;
    await execPromise(mysqldumpCmd);

    // Encriptar archivo
    const input = await fs.readFile(tempSqlPath);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv);
    const encrypted = Buffer.concat([iv, cipher.update(input), cipher.final()]);
    await fs.writeFile(tempEncryptedPath, encrypted);

    // Comprimir archivo
    const compressed = zlib.gzipSync(await fs.readFile(tempEncryptedPath));
    await fs.writeFile(tempCompressedPath, compressed);

    // Calcular checksum
    const hash = crypto.createHash('sha256');
    hash.update(compressed);
    const checksum = hash.digest('hex');

    // Subir a Google Drive
    const drive = await getDriveClient();
    const fileMetadata = {
      name: `${backupFileName}.gz`,
      parents: [config.folder_id]
    };
    const media = {
      mimeType: 'application/gzip',
      body: require('fs').createReadStream(tempCompressedPath)
    };
    const file = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id'
    });

    // Mapear backupType a data_type
    const dataTypeMap = {
      full: 'full',
      differential: 'differential',
      transactional: 'transactional'
    };
    const dataType = dataTypeMap[backupType] || 'full';

    // Registrar en base de datos
    const backupLog = await BackupLog.create({
      backup_datetime: new Date(),
      data_type: dataType,
      location: 'google_drive',
      file_size: (await fs.stat(tempCompressedPath)).size / (1024 * 1024),
      status: 'successful',
      performed_by: adminId
    });

    await BackupFiles.create({
      backup_id: backupLog.backup_id,
      file_drive_id: file.data.id,
      file_name: `${backupFileName}.gz`,
      file_size: (await fs.stat(tempCompressedPath)).size,
      checksum
    });

    // Limpiar archivos temporales
    await Promise.all([
      fs.unlink(tempSqlPath),
      fs.unlink(tempEncryptedPath),
      fs.unlink(tempCompressedPath),
      fs.unlink(sslCaPath)
    ]);

    // Limpiar respaldos antiguos
    await cleanOldBackups(drive);

    return backupLog;
  } catch (error) {
    // Mapear backupType a data_type
    const dataTypeMap = {
      full: 'full',
      differential: 'differential',
      transactional: 'transactional'
    };
    const data_type = dataTypeMap[backupType] || 'full';

    // Registrar error
    await BackupLog.create({
      backup_datetime: new Date(),
      data_type: data_type,
      location: 'google_drive',
      status: 'failed',
      error_message: error.message,
      performed_by: adminId
    });
    // Limpiar archivos temporales
    await Promise.all([
      fs.unlink(tempSqlPath).catch(() => {}),
      fs.unlink(tempEncryptedPath).catch(() => {}),
      fs.unlink(tempCompressedPath).catch(() => {}),
      fs.unlink(sslCaPath).catch(() => {})
    ]);
    throw error;
  }
}

// Limpiar respaldos antiguos
async function cleanOldBackups(drive) {
  try {
    const retentionPolicies = {
      full: 28, // 4 semanas
      differential: 7, // 1 semana
      transactional: 2 // 2 días (sin uso, pero mantenido)
    };

    for (const backupType of Object.keys(retentionPolicies)) {
      const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: backupType } });
      if (!config || !config.folder_id) {
        console.warn(`No se encontró configuración o folder_id para el tipo de respaldo ${backupType}. Saltando limpieza.`);
        continue;
      }

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionPolicies[backupType]);

      // Listar archivos en la carpeta correspondiente
      const response = await drive.files.list({
        q: `'${config.folder_id}' in parents and trashed=false`,
        fields: 'files(id, name, createdTime)'
      });

      console.log(`Archivos encontrados en la carpeta ${config.folder_id} (${backupType}):`, response.data.files);

      if (!response.data.files || response.data.files.length === 0) {
        console.log(`No hay archivos para limpiar en la carpeta ${config.folder_id} (${backupType}).`);
        continue;
      }

      for (const file of response.data.files) {
        if (!file.id || typeof file.id !== 'string' || file.id.trim() === '') {
          console.warn(`Archivo inválido encontrado en ${backupType}:`, file);
          continue;
        }

        const fileDate = new Date(file.createdTime);
        if (fileDate < cutoffDate) {
          try {
            await drive.files.delete({ fileId: file.id });
            await BackupFiles.destroy({ where: { file_drive_id: file.id } });
            console.log(`Archivo eliminado: ${file.name} (${file.id})`);
          } catch (deleteError) {
            console.error(`Error al eliminar el archivo ${file.id}: ${deleteError.message}`);
          }
        }
      }
    }
  } catch (error) {
    throw new Error(`Error al limpiar respaldos antiguos: ${error.message}`);
  }
}

// Restaurar respaldo
async function restoreBackup(adminId, backupId) {
  await ensureTempDir();
  const tempCompressedPath = path.join(TEMP_DIR, `restore_${backupId}.gz`);
  const tempEncryptedPath = path.join(TEMP_DIR, `restore_${backupId}.enc`);
  const tempSqlPath = path.join(TEMP_DIR, `restore_${backupId}.sql`);
  const sslCaPath = path.join(TEMP_DIR, 'ca.pem');

  try {
    // Verificar respaldo
    const backupLog = await BackupLog.findOne({ 
      where: { backup_id: backupId }, 
      include: [{ model: BackupFiles }] 
    });
    if (!backupLog || !backupLog.BackupFiles.length) throw new Error('Archivo de respaldo no encontrado');

    const backupFile = backupLog.BackupFiles[0];
    const backupType = backupLog.data_type;

    // Bloquear sistema
    await SystemConfig.update({ is_restoring: true }, { where: { id: 1 } });

    // Descargar archivo
    const drive = await getDriveClient();
    const fileStream = await drive.files.get(
      { fileId: backupFile.file_drive_id, alt: 'media' },
      { responseType: 'stream' }
    );
    const writeStream = require('fs').createWriteStream(tempCompressedPath);
    await new Promise((resolve, reject) => {
      fileStream.data.pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    // Verificar checksum
    const fileData = await fs.readFile(tempCompressedPath);
    const hash = crypto.createHash('sha256');
    hash.update(fileData);
    const checksum = hash.digest('hex');
    if (checksum !== backupFile.checksum) {
      throw new Error('Checksum no coincide');
    }

    // Descomprimir
    const decompressed = zlib.gunzipSync(fileData);
    await fs.writeFile(tempEncryptedPath, decompressed);

    // Desencriptar
    const encryptedData = await fs.readFile(tempEncryptedPath);
    const iv = encryptedData.slice(0, 16);
    const encrypted = encryptedData.slice(16);
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), iv);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    await fs.writeFile(tempSqlPath, decrypted);

    // Restaurar base de datos
    await fs.writeFile(sslCaPath, process.env.DB_SSL_CA); // Usar DB_SSL_CA en lugar de DB_SSL_CA_PATH

    if (backupType === 'full') {
      const mysqlCmd = `mysql -u${process.env.DB_USER} -p${process.env.DB_PASSWORD} -h${process.env.DB_HOST} -P${process.env.DB_PORT} --ssl-ca="${sslCaPath}" ${process.env.DB_NAME} < "${tempSqlPath}"`;
      await execPromise(mysqlCmd);
    } else if (backupType === 'differential') {
      // Restaurar el full backup más reciente primero
      const latestFullBackup = await BackupLog.findOne({
        where: { data_type: 'full', status: 'successful' },
        order: [['backup_datetime', 'DESC']],
        include: [{ model: BackupFiles }]
      });
      if (!latestFullBackup) throw new Error('No se encontró un respaldo completo reciente');
      const fullBackupFile = latestFullBackup.BackupFiles[0];

      // Descargar y restaurar full backup
      const fullTempCompressedPath = path.join(TEMP_DIR, `full_restore_${latestFullBackup.backup_id}.gz`);
      const fullTempEncryptedPath = path.join(TEMP_DIR, `full_restore_${latestFullBackup.backup_id}.enc`);
      const fullTempSqlPath = path.join(TEMP_DIR, `full_restore_${latestFullBackup.backup_id}.sql`);

      const fullFileStream = await drive.files.get(
        { fileId: fullBackupFile.file_drive_id, alt: 'media' },
        { responseType: 'stream' }
      );
      const fullWriteStream = require('fs').createWriteStream(fullTempCompressedPath);
      await new Promise((resolve, reject) => {
        fullFileStream.data.pipe(fullWriteStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      const fullFileData = await fs.readFile(fullTempCompressedPath);
      const fullDecompressed = zlib.gunzipSync(fullFileData);
      await fs.writeFile(fullTempEncryptedPath, fullDecompressed);

      const fullEncryptedData = await fs.readFile(fullTempEncryptedPath);
      const fullIv = fullEncryptedData.slice(0, 16);
      const fullEncrypted = fullEncryptedData.slice(16);
      const fullDecipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), fullIv);
      const fullDecrypted = Buffer.concat([fullDecipher.update(fullEncrypted), fullDecipher.final()]);
      await fs.writeFile(fullTempSqlPath, fullDecrypted);

      const fullMysqlCmd = `mysql -u${process.env.DB_USER} -p${process.env.DB_PASSWORD} -h${process.env.DB_HOST} -P${process.env.DB_PORT} --ssl-ca="${sslCaPath}" ${process.env.DB_NAME} < "${fullTempSqlPath}"`;
      await execPromise(fullMysqlCmd);

      // Aplicar diferencial
      const diffMysqlCmd = `mysql -u${process.env.DB_USER} -p${process.env.DB_PASSWORD} -h${process.env.DB_HOST} -P${process.env.DB_PORT} --ssl-ca="${sslCaPath}" ${process.env.DB_NAME} < "${tempSqlPath}"`;
      await execPromise(diffMysqlCmd);

      // Limpiar archivos temporales del full backup
      await Promise.all([
        fs.unlink(fullTempCompressedPath),
        fs.unlink(fullTempEncryptedPath),
        fs.unlink(fullTempSqlPath)
      ]);
    } else if (backupType === 'transactional') {
      throw new Error('Los respaldos transaccionales no están habilitados actualmente.');
    }

    // Registrar restauración
    const restorationLog = await RestorationLog.create({
      backup_id: backupId,
      restoration_datetime: new Date(),
      status: 'successful',
      performed_by: adminId
    });

    // Desbloquear sistema
    await SystemConfig.update({ is_restoring: false }, { where: { id: 1 } });

    // Limpiar archivos temporales
    await Promise.all([
      fs.unlink(tempCompressedPath),
      fs.unlink(tempEncryptedPath),
      fs.unlink(tempSqlPath),
      fs.unlink(sslCaPath)
    ]);

    return restorationLog;
  } catch (error) {
    // Registrar error
    await RestorationLog.create({
      backup_id: backupId,
      restoration_datetime: new Date(),
      status: 'failed',
      error_message: error.message,
      performed_by: adminId
    });
    // Desbloquear sistema
    await SystemConfig.update({ is_restoring: false }, { where: { id: 1 } });
    // Limpiar archivos temporales
    await Promise.all([
      fs.unlink(tempCompressedPath).catch(() => {}),
      fs.unlink(tempEncryptedPath).catch(() => {}),
      fs.unlink(tempSqlPath).catch(() => {}),
      fs.unlink(sslCaPath).catch(() => {})
    ]);
    throw error;
  }
}

// Listar respaldos
async function listBackups(where = {}) {
  return BackupLog.findAll({
    where,
    include: [{ model: BackupFiles, attributes: ['file_name', 'file_size', 'checksum'] }],
    order: [['backup_datetime', 'DESC']]
  });
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  generateBackup,
  restoreBackup,
  listBackups,
  getConfig
};