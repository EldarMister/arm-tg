const { google } = require('googleapis');

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

/**
 * Возвращает:
 *   null  — папка с именем контейнера не найдена
 *   []    — папка найдена, но пустая
 *   [{id, name, mimeType}]  — список файлов
 */
async function getContainerFiles(containerNomer) {
  const drive = getDrive();
  const parentId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const name = containerNomer.toUpperCase();

  // 1. Ищем вложенную папку с именем контейнера
  const folderRes = await drive.files.list({
    q: `name = '${name}' and '${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  const folder = folderRes.data.files?.[0];
  if (!folder) return null;

  // 2. Список файлов внутри папки
  const filesRes = await drive.files.list({
    q: `'${folder.id}' in parents and trashed = false`,
    fields: 'files(id, name, mimeType, size)',
    orderBy: 'name',
    pageSize: 50,
  });

  return filesRes.data.files || [];
}

/**
 * Скачивает файл из Google Drive как stream.
 * Используется для отправки файлов в Telegram напрямую.
 */
async function downloadFile(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
}

module.exports = { getContainerFiles, downloadFile };
