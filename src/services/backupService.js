const { google } = require('googleapis');
const crypto = require('crypto');
const { exec } = require('child_process');
const zlib = require('zlib');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');
const execPromise = util.promisify(exec);
const { BackupConfig, BackupLog, BackupFiles, RestorationLog, SystemConfig } = require('../models/Associations');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Directorio temporal para archivos
const TEMP_DIR = path.join('/tmp', 'ecommerce_backups');
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
    const subfolders = ['full', 'diff', 'txn', 'others'];
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
    const defaultDataTypes = {
      full: ['full'],
      differential: ['transactions', 'clients', 'configuration'],
      transactional: ['transactions']
    };
    const defaultFrequencies = {
      full: 'weekly',
      differential: 'daily',
      transactional: 'hourly'
    };
    for (const backupType of ['full', 'differential', 'transactional']) {
      const existingConfig = await BackupConfig.findOne({ 
        where: { storage_type: 'google_drive', backup_type: backupType } 
      });
      if (existingConfig) {
        await existingConfig.update({
          refresh_token: encryptedTokenWithIv,
          folder_id: subfolderIds[backupType],
          created_by: adminId
        });
      } else {
        await BackupConfig.create({
          backup_type: backupType,
          frequency: defaultFrequencies[backupType],
          data_types: JSON.stringify(defaultDataTypes[backupType]),
          storage_type: 'google_drive',
          refresh_token: encryptedTokenWithIv,
          folder_id: subfolderIds[backupType],
          schedule_time: '00:00:00',
          created_by: adminId
        });
      }
    }

    // Configurar subcarpeta para archivos estáticos (others)
    const fullConfig = await BackupConfig.findOne({ 
      where: { storage_type: 'google_drive', backup_type: 'full' } 
    });
    if (fullConfig) {
      await fullConfig.update({
        static_folder_id: subfolderIds.others
      });
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
      data_types: Array.isArray(config.data_types) ? config.data_types : JSON.parse(config.data_types)
    };
  }
  return null;
}

// Generar respaldo
async function generateBackup(adminId, dataTypes, backupType) {
  await ensureTempDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  let backupFileName, tempSqlPath, tempEncryptedPath, tempCompressedPath;

  try {
    // Configuración según tipo de respaldo
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: backupType } });
    if (!config) throw new Error(`No hay configuración para respaldo ${backupType}`);

    // Mapear data_types a tablas
    const tableGroups = {
      transactions: ['orders', 'order_details', 'payments', 'order_history', 'coupon_usages'],
      clients: ['users', 'accounts', 'addresses', 'communication_preferences', 'carts', 'cart_details'],
      configuration: ['system_config', 'email_templates', 'categories', 'promotions', 'banners']
    };
    let tables = [];
    let parsedDataTypes = dataTypes;
    if (typeof dataTypes === 'string') {
      parsedDataTypes = JSON.parse(dataTypes);
    }
    parsedDataTypes.forEach(type => {
      if (tableGroups[type]) tables.push(...tableGroups[type]);
    });
    if (parsedDataTypes.includes('full')) {
      tables = Object.values(tableGroups).flat();
    }
    tables = [...new Set(tables)];

    // Generar nombres de archivo según tipo
    if (backupType === 'transactional') {
      backupFileName = `txn_backup_${timestamp}.bin`;
      tempSqlPath = path.join(TEMP_DIR, backupFileName);
      tempEncryptedPath = path.join(TEMP_DIR, `${backupFileName}.enc`);
      tempCompressedPath = path.join(TEMP_DIR, `${backupFileName}.gz`);
    } else {
      backupFileName = `${backupType === 'full' ? 'full' : 'diff'}_backup_${timestamp}.sql`;
      tempSqlPath = path.join(TEMP_DIR, backupFileName);
      tempEncryptedPath = path.join(TEMP_DIR, `${backupFileName}.enc`);
      tempCompressedPath = path.join(TEMP_DIR, `${backupFileName}.gz`);
    }

    // Generar respaldo
    if (backupType === 'transactional') {
      // Respaldo de binlog
      const binlogDir = process.env.MYSQL_BINLOG_DIR || '/var/log/mysql';
      await execPromise(`mysqladmin -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} flush-logs`);
      const binlogFiles = await fs.readdir(binlogDir);
      const latestBinlog = binlogFiles.filter(f => f.startsWith('binlog.')).sort().pop();
      if (!latestBinlog) throw new Error('No se encontró un binlog reciente');
      await fs.copyFile(path.join(binlogDir, latestBinlog), tempSqlPath);
    } else {
      // Respaldo completo o diferencial con mysqldump
      const mysqldumpOptions = backupType === 'differential' ? '--no-create-info' : '--single-transaction';
      const mysqldumpCmd = `mysqldump -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${mysqldumpOptions} ${process.env.DB_NAME} ${tables.join(' ')} > ${tempSqlPath}`;
      await execPromise(mysqldumpCmd);
    }

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
    const dataType = dataTypeMap[backupType] || 'full'; // Por defecto, 'full' si no coincide

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
      fs.unlink(tempCompressedPath)
    ]);

    // Si es respaldo completo, incluir archivos estáticos y limpiar respaldos antiguos
    if (backupType === 'full') {
      await backupStaticFiles(adminId, drive, config.static_folder_id || config.folder_id);
      await cleanOldBackups(drive);
    }

    return backupLog;
  } catch (error) {
    // Mapear backupType a data_type
    const dataTypeMap = {
      full: 'full',
      differential: 'differential',
      transactional: 'transactional'
    };
    const dataType = dataTypeMap[backupType] || 'full'; // Por defecto, 'full' si no coincide

    // Registrar error
    await BackupLog.create({
      backup_datetime: new Date(),
      data_type: dataType,
      location: 'google_drive',
      status: 'failed',
      error_message: error.message,
      performed_by: adminId
    });
    // Limpiar archivos temporales
    await Promise.all([
      fs.unlink(tempSqlPath).catch(() => {}),
      fs.unlink(tempEncryptedPath).catch(() => {}),
      fs.unlink(tempCompressedPath).catch(() => {})
    ]);
    throw error;
  }
}

// Respaldar archivos estáticos (frontend y backend)
async function backupStaticFiles(adminId, drive, staticFolderId) {
  await ensureTempDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const staticBackupFileName = `others_backup_${timestamp}.tar.gz`;
  const tempStaticPath = path.join(TEMP_DIR, staticBackupFileName);

  try {
    // Comprimir archivos estáticos
    const staticDirs = [
      path.join(__dirname, '../../frontend/dist'), // Angular frontend
      path.join(__dirname, '../..') // Express backend (excluyendo node_modules)
    ];
    const tarCmd = `tar --exclude='node_modules' -czf ${tempStaticPath} ${staticDirs.join(' ')}`;
    await execPromise(tarCmd);

    // Calcular checksum
    const compressed = await fs.readFile(tempStaticPath);
    const hash = crypto.createHash('sha256');
    hash.update(compressed);
    const checksum = hash.digest('hex');

    // Subir a Google Drive
    const fileMetadata = {
      name: staticBackupFileName,
      parents: [staticFolderId]
    };
    const media = {
      mimeType: 'application/gzip',
      body: require('fs').createReadStream(tempStaticPath)
    };
    const file = await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id'
    });

    // Registrar en base de datos
    const backupLog = await BackupLog.create({
      backup_datetime: new Date(),
      data_type: 'others',
      location: 'google_drive',
      file_size: (await fs.stat(tempStaticPath)).size / (1024 * 1024),
      status: 'successful',
      performed_by: adminId
    });

    await BackupFiles.create({
      backup_id: backupLog.backup_id,
      file_drive_id: file.data.id,
      file_name: staticBackupFileName,
      file_size: (await fs.stat(tempStaticPath)).size,
      checksum
    });

    // Limpiar archivo temporal
    await fs.unlink(tempStaticPath);
  } catch (error) {
    // Registrar error
    await BackupLog.create({
      backup_datetime: new Date(),
      data_type: 'others',
      location: 'google_drive',
      status: 'failed',
      error_message: error.message,
      performed_by: adminId
    });
    await fs.unlink(tempStaticPath).catch(() => {});
    throw error;
  }
}

// Limpiar respaldos antiguos
async function cleanOldBackups(drive) {
  try {
    const retentionPolicies = {
      full: 28, // 4 semanas
      differential: 7, // 1 semana
      transactional: 2, // 2 días
      others: 28 // 4 semanas
    };

    for (const backupType of Object.keys(retentionPolicies)) {
      const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive', backup_type: backupType } });
      if (!config) continue;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionPolicies[backupType]);

      // Listar archivos en la carpeta correspondiente
      const response = await drive.files.list({
        q: `'${config.folder_id}' in parents and trashed=false`,
        fields: 'files(id, name, createdTime)'
      });

      for (const file of response.data.files) {
        const fileDate = new Date(file.createdTime);
        if (fileDate < cutoffDate) {
          await drive.files.delete({ fileId: file.id });
          await BackupFiles.destroy({ where: { file_drive_id: file.id } });
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
    if (backupType === 'full') {
      const mysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${tempSqlPath}`;
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

      const fullMysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${fullTempSqlPath}`;
      await execPromise(fullMysqlCmd);

      // Aplicar diferencial
      const diffMysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${tempSqlPath}`;
      await execPromise(diffMysqlCmd);

      // Limpiar archivos temporales del full backup
      await Promise.all([
        fs.unlink(fullTempCompressedPath),
        fs.unlink(fullTempEncryptedPath),
        fs.unlink(fullTempSqlPath)
      ]);
    } else if (backupType === 'transactional') {
      // Restaurar full y diferencial más recientes, luego aplicar binlog
      const latestFullBackup = await BackupLog.findOne({
        where: { data_type: 'full', status: 'successful' },
        order: [['backup_datetime', 'DESC']],
        include: [{ model: BackupFiles }]
      });
      if (!latestFullBackup) throw new Error('No se encontró un respaldo completo reciente');

      const latestDiffBackup = await BackupLog.findOne({
        where: { data_type: 'differential', status: 'successful' },
        order: [['backup_datetime', 'DESC']],
        include: [{ model: BackupFiles }]
      });

      // Restaurar full
      const fullBackupFile = latestFullBackup.BackupFiles[0];
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

      const fullMysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${fullTempSqlPath}`;
      await execPromise(fullMysqlCmd);

      // Restaurar diferencial si existe
      if (latestDiffBackup) {
        const diffBackupFile = latestDiffBackup.BackupFiles[0];
        const diffTempCompressedPath = path.join(TEMP_DIR, `diff_restore_${latestDiffBackup.backup_id}.gz`);
        const diffTempEncryptedPath = path.join(TEMP_DIR, `diff_restore_${latestDiffBackup.backup_id}.enc`);
        const diffTempSqlPath = path.join(TEMP_DIR, `diff_restore_${latestDiffBackup.backup_id}.sql`);

        const diffFileStream = await drive.files.get(
          { fileId: diffBackupFile.file_drive_id, alt: 'media' },
          { responseType: 'stream' }
        );
        const diffWriteStream = require('fs').createWriteStream(diffTempCompressedPath);
        await new Promise((resolve, reject) => {
          diffFileStream.data.pipe(diffWriteStream)
            .on('finish', resolve)
            .on('error', reject);
        });

        const diffFileData = await fs.readFile(diffTempCompressedPath);
        const diffDecompressed = zlib.gunzipSync(diffFileData);
        await fs.writeFile(diffTempEncryptedPath, diffDecompressed);

        const diffEncryptedData = await fs.readFile(diffTempEncryptedPath);
        const diffIv = diffEncryptedData.slice(0, 16);
        const diffEncrypted = diffEncryptedData.slice(16);
        const diffDecipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, Buffer.from(process.env.ENCRYPTION_KEY, 'hex'), diffIv);
        const diffDecrypted = Buffer.concat([diffDecipher.update(diffEncrypted), diffDecipher.final()]);
        await fs.writeFile(diffTempSqlPath, diffDecrypted);

        const diffMysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${diffTempSqlPath}`;
        await execPromise(diffMysqlCmd);

        await Promise.all([
          fs.unlink(diffTempCompressedPath),
          fs.unlink(diffTempEncryptedPath),
          fs.unlink(diffTempSqlPath)
        ]);
      }

      // Convertir binlog a SQL y aplicar
      const binlogSqlPath = path.join(TEMP_DIR, `binlog_restore_${backupId}.sql`);
      const mysqlbinlogCmd = `mysqlbinlog --verbose ${tempSqlPath} > ${binlogSqlPath}`;
      await execPromise(mysqlbinlogCmd);

      const binlogMysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${binlogSqlPath}`;
      await execPromise(binlogMysqlCmd);

      await fs.unlink(binlogSqlPath);
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
      fs.unlink(tempSqlPath)
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
      fs.unlink(tempSqlPath).catch(() => {})
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