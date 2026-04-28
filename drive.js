const { google } = require('googleapis');
const {
  containerInputMatchesFolder,
  getEnv,
  getMultilineEnv,
} = require('./env');

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const nameCollator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function getDrive() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: getEnv('GOOGLE_CLIENT_EMAIL'),
      private_key: getMultilineEnv('GOOGLE_PRIVATE_KEY'),
    },
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  return google.drive({ version: 'v3', auth });
}

function sortDriveItems(items) {
  return items.slice().sort((a, b) => {
    const aFolder = a.mimeType === FOLDER_MIME;
    const bFolder = b.mimeType === FOLDER_MIME;
    if (aFolder !== bFolder) return aFolder ? -1 : 1;
    return nameCollator.compare(a.name || '', b.name || '');
  });
}

async function listChildren(drive, folderId) {
  const items = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, size)',
      pageSize: 1000,
      pageToken,
    });
    items.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return sortDriveItems(items);
}

async function findContainerFolder(drive, parentId, containerInput) {
  const folders = await listChildren(drive, parentId);
  const folder = folders.find(
    item => item.mimeType === FOLDER_MIME && containerInputMatchesFolder(containerInput, item.name)
  ) || null;

  if (!folder) {
    console.warn('drive: container folder not found', {
      parentId,
      input: containerInput,
      visibleFolders: folders
        .filter(item => item.mimeType === FOLDER_MIME)
        .map(item => item.name),
    });
  }

  return folder;
}

async function flattenFiles(drive, folderId, prefix = '') {
  const result = [];
  const items = await listChildren(drive, folderId);
  for (const item of items) {
    const path = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.mimeType === FOLDER_MIME) {
      result.push(...await flattenFiles(drive, item.id, path));
      continue;
    }
    result.push({ ...item, path });
  }
  return result;
}

async function getContainerFiles(containerNomer) {
  const drive = getDrive();
  const parentId = getEnv('GOOGLE_DRIVE_FOLDER_ID');
  const folder = await findContainerFolder(drive, parentId, containerNomer);

  if (!folder) return null;
  return flattenFiles(drive, folder.id);
}

async function downloadFile(fileId) {
  const drive = getDrive();
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return res.data;
}

module.exports = { getContainerFiles, downloadFile };
