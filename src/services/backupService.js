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
const TEMP_DIR = path.join(__dirname, '../../temp');
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

    // Crear carpeta en Google Drive
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const folderMetadata = {
      name: 'FilograficosBackups',
      mimeType: 'application/vnd.google-apps.folder'
    };
    const folder = await drive.files.create({
      resource: folderMetadata,
      fields: 'id'
    });

    // Encriptar refresh token
    const iv = crypto.randomBytes(16); // Generar IV aleatorio
    const cipher = crypto.createCipheriv(
      ENCRYPTION_ALGORITHM,
      Buffer.from(process.env.ENCRYPTION_KEY, 'hex'),
      iv
    );
    let encryptedToken = cipher.update(tokens.refresh_token, 'utf8', 'hex');
    encryptedToken += cipher.final('hex');
    const encryptedTokenWithIv = iv.toString('hex') + ':' + encryptedToken; // Almacenar IV junto con el token encriptado

    // Actualizar o crear configuración
    const defaultDataTypes = ['transactions', 'clients']; // Usar array directamente
    const existingConfig = await BackupConfig.findOne({ where: { storage_type: 'google_drive' } });
    if (existingConfig) {
      await existingConfig.update({
        refresh_token: encryptedTokenWithIv,
        folder_id: folder.data.id,
        created_by: adminId,
        data_types: defaultDataTypes // Asegurar que data_types sea válido
      });
    } else {
      await BackupConfig.create({
        frequency: 'daily',
        data_types: defaultDataTypes, // Usar array directamente
        storage_type: 'google_drive',
        refresh_token: encryptedTokenWithIv,
        folder_id: folder.data.id,
        schedule_time: '02:00:00',
        created_by: adminId
      });
    }

    return folder.data.id;
  } catch (error) {
    throw new Error(`Error en callback OAuth2: ${error.message}`);
  }
}

// Obtener cliente autenticado de Drive
async function getDriveClient() {
  const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive' } });
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

// Generar respaldo
async function generateBackup(adminId, dataTypes) {
  await ensureTempDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_${timestamp}.sql`;
  const tempSqlPath = path.join(TEMP_DIR, backupFileName);
  const tempEncryptedPath = path.join(TEMP_DIR, `${backupFileName}.enc`);
  const tempCompressedPath = path.join(TEMP_DIR, `${backupFileName}.gz`);

  try {
    // Mapear data_types a tablas
    const tableGroups = {
      transactions: ['orders', 'order_details', 'payments', 'order_history', 'coupon_usages'],
      clients: ['users', 'accounts', 'addresses', 'communication_preferences', 'carts', 'cart_details'],
      configuration: ['system_config', 'email_templates', 'categories', 'promotions', 'banners']
    };
    let tables = [];
    dataTypes.forEach(type => {
      if (tableGroups[type]) tables.push(...tableGroups[type]);
    });
    if (dataTypes.includes('full')) {
      tables = Object.values(tableGroups).flat();
    }
    tables = [...new Set(tables)]; // Eliminar duplicados

    // Generar respaldo con mysqldump
    const mysqldumpCmd = `mysqldump -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} ${tables.join(' ')} > ${tempSqlPath}`;
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
    const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive' } });
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

    // Registrar en base de datos
    const backupLog = await BackupLog.create({
      backup_datetime: new Date(),
      data_type: dataTypes.includes('full') ? 'full' : dataTypes.join(','),
      location: 'google_drive',
      file_size: (await fs.stat(tempCompressedPath)).size / (1024 * 1024), // MB
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

    return backupLog;
  } catch (error) {
    // Registrar error
    await BackupLog.create({
      backup_datetime: new Date(),
      data_type: dataTypes.join(','),
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

// Restaurar respaldo
async function restoreBackup(adminId, backupId) {
  await ensureTempDir();
  const tempCompressedPath = path.join(TEMP_DIR, `restore_${backupId}.gz`);
  const tempEncryptedPath = path.join(TEMP_DIR, `restore_${backupId}.enc`);
  const tempSqlPath = path.join(TEMP_DIR, `restore_${backupId}.sql`);

  try {
    // Verificar respaldo
    const backupFile = await BackupFiles.findOne({ where: { backup_id: backupId } });
    if (!backupFile) throw new Error('Archivo de respaldo no encontrado');

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
    const mysqlCmd = `mysql -h ${process.env.DB_HOST} -u ${process.env.DB_USER} -p${process.env.DB_PASSWORD} ${process.env.DB_NAME} < ${tempSqlPath}`;
    await execPromise(mysqlCmd);

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
async function listBackups() {
  return BackupLog.findAll({
    include: [{ model: BackupFiles, attributes: ['file_name', 'file_size', 'checksum'] }],
    order: [['backup_datetime', 'DESC']]
  });
}

// Obtener configuración
async function getConfig() {
  const config = await BackupConfig.findOne({ where: { storage_type: 'google_drive' } });
  if (config) {
    return {
      ...config.toJSON(),
      data_types: Array.isArray(config.data_types) ? config.data_types : JSON.parse(config.data_types)
    };
  }
  return null;
}

module.exports = {
  getAuthUrl,
  handleOAuthCallback,
  generateBackup,
  restoreBackup,
  listBackups,
  getConfig
};