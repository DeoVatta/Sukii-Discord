/**
 * Google Drive Source — list + download files for Sukii Discord booster channel
 * Uses service account (hermes-babyval@...)
 */
import { google } from 'googleapis';
import { createRequire } from 'module';
import path from 'path';
import fs from 'fs';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(path.resolve(import.meta.url));

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive',
];
const CREDENTIALS_PATH = path.join(__dirname, 'service-account.json');

let drive = null;

function initDrive() {
  if (drive) return drive;
  const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
  const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  drive = google.drive({ version: 'v3', auth });
  return drive;
}

/**
 * List files in a Drive folder, newest first
 * @param {string} folderId
 * @param {number} limit
 * @returns {Promise<Array>}
 */
async function listFiles(folderId, limit = 10) {
  const res = await initDrive().files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size, createdTime, thumbnailLink, webContentLink)',
    orderBy: 'createdTime desc',
    pageSize: limit,
  });
  return res.data.files || [];
}

/**
 * Download a file as Buffer
 * @param {string} fileId
 * @returns {Promise<Buffer>}
 */
async function downloadFile(fileId) {
  const res = await initDrive().files.get({
    fileId,
    alt: 'media',
    responseType: 'arraybuffer',
  });
  return Buffer.from(res.data);
}

/**
 * Get file metadata
 * @param {string} fileId
 */
async function getFileMeta(fileId) {
  const res = await initDrive().files.get({
    fileId,
    fields: 'id, name, mimeType, size, createdTime, thumbnailLink',
  });
  return res.data;
}

module.exports = { initDrive, listFiles, downloadFile, getFileMeta };