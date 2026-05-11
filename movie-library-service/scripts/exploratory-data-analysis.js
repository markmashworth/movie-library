import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { google } from 'googleapis';

const ROOT_FOLDER_ID = '1Z-Bqt69UgrGkwo0ArjHaNrA7uUmUm2r6';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const JSON_MIME_TYPE = 'application/json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIALS_PATH = join(__dirname, 'credentials.json');
const TOKEN_PATH = join(__dirname, 'token.json');
const OUTPUT_DIR = join(__dirname, 'data');
const OUTPUT_PATH = join(OUTPUT_DIR, 'movies.csv');

async function readJsonFile(path) {
  const file = await import('fs/promises').then(({ readFile }) => readFile(path, 'utf8'));
  return JSON.parse(file);
}

async function createAuthClient() {
  const credentials = await readJsonFile(CREDENTIALS_PATH);
  const token = await readJsonFile(TOKEN_PATH);
  const clientConfig = credentials.installed ?? credentials.web;

  if (!clientConfig) {
    throw new Error('Expected credentials.json to contain an "installed" or "web" OAuth client.');
  }

  const auth = new google.auth.OAuth2(
    clientConfig.client_id,
    clientConfig.client_secret,
    clientConfig.redirect_uris?.[0],
  );

  auth.setCredentials(token);
  return auth;
}

async function listChildren(drive, folderId) {
  const files = [];
  let pageToken;

  do {
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, modifiedTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    files.push(...(response.data.files ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return files.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
}

async function collectFiles(drive, folderId, pathParts = []) {
  const children = await listChildren(drive, folderId);
  const files = [];

  for (const child of children) {
    const name = child.name ?? child.id;

    if (child.mimeType === DRIVE_FOLDER_MIME_TYPE) {
      files.push(...await collectFiles(drive, child.id, [...pathParts, name]));
      continue;
    }

    files.push({
      ...child,
      sourcePath: [...pathParts, name].join('/'),
    });
  }

  return files;
}

function isJsonFile(file) {
  return file.mimeType === JSON_MIME_TYPE || file.name?.toLowerCase().endsWith('.json');
}

async function downloadTextFile(drive, fileId) {
  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'text' },
  );

  return response.data;
}

function rowsFromJson(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value : [{}];
  }

  if (value !== null && typeof value === 'object') {
    return [value];
  }

  return [{ value }];
}

function serializeCsvValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  const stringValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replaceAll('"', '""')}"` : stringValue;
}

function buildCsv(rows) {
  const metadataColumns = ['source_file_id', 'source_file_name', 'source_path', 'source_modified_time'];
  const dataColumns = [...new Set(rows.flatMap(({ data }) => Object.keys(data)))].sort();
  const columns = [...metadataColumns, ...dataColumns];
  const csvRows = [
    columns.join(','),
    ...rows.map(({ metadata, data }) => (
      columns.map((column) => serializeCsvValue(metadata[column] ?? data[column])).join(',')
    )),
  ];

  return `${csvRows.join('\n')}\n`;
}

async function main() {
  const auth = await createAuthClient();
  const drive = google.drive({ version: 'v3', auth });
  const files = await collectFiles(drive, ROOT_FOLDER_ID);
  const rows = [];

  for (const file of files) {
    if (!isJsonFile(file)) {
      console.warn(`Warning: skipping non-JSON file: ${file.sourcePath} (${file.mimeType ?? 'unknown mime type'})`);
      continue;
    }

    try {
      const text = await downloadTextFile(drive, file.id);
      const records = rowsFromJson(JSON.parse(text));

      for (const record of records) {
        rows.push({
          metadata: {
            source_file_id: file.id,
            source_file_name: file.name,
            source_path: file.sourcePath,
            source_modified_time: file.modifiedTime,
          },
          data: record && typeof record === 'object' && !Array.isArray(record)
            ? record
            : { value: record },
        });
      }
    } catch (error) {
      console.warn(`Warning: failed to parse JSON file: ${file.sourcePath} (${error.message})`);
    }
  }

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(OUTPUT_PATH, buildCsv(rows), 'utf8');
  console.log(`Wrote ${rows.length} rows to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
