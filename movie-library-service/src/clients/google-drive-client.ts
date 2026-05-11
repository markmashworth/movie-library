import { google } from 'googleapis';
import type { drive_v3 } from 'googleapis';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder' as const;
const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Constructor options for {@link GoogleDriveClient}. */
export interface GoogleDriveClientOptions {
  /**
   * Maximum number of retry attempts on transient failures.
   * Passed directly to gaxios `retryConfig.retries`.
   * @default 3
   */
  retries?: number;
}

export interface DriveFile {
  kind: 'file';
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

export interface DriveFolder {
  kind: 'folder';
  id: string;
  name: string;
  mimeType: typeof FOLDER_MIME_TYPE;
  modifiedTime?: string;
  parents?: string[];
}

/** A union of every item that can appear inside a Drive directory listing */
export type DriveEntry = DriveFile | DriveFolder;

// ---------------------------------------------------------------------------
// GoogleDriveClient
// ---------------------------------------------------------------------------

/**
 * A thin, read-only wrapper around the Google Drive v3 API that authenticates
 * via OAuth 2. Use {@link GoogleDriveClient.fromEnv} to create an instance.
 *
 * Required environment variables:
 *   GOOGLE_CLIENT_ID      – OAuth2 client ID
 *   GOOGLE_CLIENT_SECRET  – OAuth2 client secret
 *   GOOGLE_REDIRECT_URI   – OAuth2 redirect URI registered for the client
 *   GOOGLE_REFRESH_TOKEN  – Long-lived refresh token from the consent flow
 *
 * **Retry policy** (handled by gaxios):
 *   - Retried status codes: 429, 500, 502, 503, 504
 *   - Network failures (no response) are retried via `noResponseRetries`
 *   - Backoff: exponential, with a `Retry-After` header honoured on 429
 *   - Configurable via the `retries` constructor option (default: 3)
 */
export class GoogleDriveClient {
  private readonly drive: drive_v3.Drive;

  private constructor(drive: drive_v3.Drive) {
    this.drive = drive;
  }

  // ---------------------------------------------------------------------------
  // Factory
  // ---------------------------------------------------------------------------

  /**
   * Create a {@link GoogleDriveClient} from environment variables:
   *
   * - `GOOGLE_CLIENT_ID`
   * - `GOOGLE_CLIENT_SECRET`
   * - `GOOGLE_REDIRECT_URI`
   * - `GOOGLE_REFRESH_TOKEN`
   *
   * Throws if any required variable is absent.
   *
   * @param options - Optional {@link GoogleDriveClientOptions} (e.g. `retries`).
   */
  static fromEnv(options: GoogleDriveClientOptions = {}): GoogleDriveClient {
    const vars = {
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
      GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
      GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
    };

    const missing = (Object.keys(vars) as Array<keyof typeof vars>).filter(
      (key) => !vars[key],
    );

    if (missing.length > 0) {
      throw new Error(
        `GoogleDriveClient: missing required environment variable(s): ${missing.join(', ')}`,
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      vars.GOOGLE_CLIENT_ID,
      vars.GOOGLE_CLIENT_SECRET,
      vars.GOOGLE_REDIRECT_URI,
    );

    oauth2Client.setCredentials({
      refresh_token: vars.GOOGLE_REFRESH_TOKEN!,
      scope: DRIVE_SCOPES.join(' '),
    });

    const retries = options.retries ?? 3;

    google.options({
      retryConfig: {
        retries,
        noResponseRetries: retries,
        retryableStatusCodes: [429, 500, 502, 503, 504],
        httpMethodsToRetry: ['GET'],
        retryBackoff: async (err: unknown, defaultDelay: number) => {
          type GaxiosLike = { response?: { headers?: Record<string, string> } };
          const retryAfter = (err as GaxiosLike)?.response?.headers?.['retry-after'];
          const ms =
            retryAfter != null && Number.isFinite(Number(retryAfter)) && Number(retryAfter) > 0
              ? Number(retryAfter) * 1_000
              : defaultDelay;
          await new Promise((resolve) => setTimeout(resolve, ms));
        },
      },
    });

    return new GoogleDriveClient(google.drive({ version: 'v3', auth: oauth2Client }));
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * List the immediate contents of a Drive folder — its direct files and
   * subdirectories only. No recursive traversal is performed.
   *
   * @param folderId - The Google Drive folder ID to inspect.
   * @returns The direct children of the folder as {@link DriveEntry} items.
   */
  async listDirectory(folderId: string): Promise<DriveEntry[]> {
    const items = await this.fetchFolderContents(folderId);

    return items.map((item): DriveEntry => {
      if (item.mimeType === FOLDER_MIME_TYPE) {
        return {
          kind: 'folder',
          id: item.id!,
          name: item.name!,
          mimeType: FOLDER_MIME_TYPE,
          ...(item.modifiedTime != null && { modifiedTime: item.modifiedTime }),
          ...(item.parents != null && { parents: item.parents }),
        };
      }

      return {
        kind: 'file',
        id: item.id!,
        name: item.name!,
        mimeType: item.mimeType!,
        ...(item.size != null && { size: item.size }),
        ...(item.modifiedTime != null && { modifiedTime: item.modifiedTime }),
        ...(item.parents != null && { parents: item.parents }),
      };
    });
  }

  /**
   * Fetch the raw text content of a Drive file. Intended for small text-based
   * files (e.g. JSON). The full body is buffered in memory.
   *
   * @param fileId - The Google Drive file ID to download.
   * @returns The file's contents as a UTF-8 string.
   */
  async getFileContent(fileId: string): Promise<string> {
    const response = await this.drive.files.get(
      {
        fileId,
        alt: 'media',
        supportsAllDrives: true,
      },
      { responseType: 'text' },
    );

    // When responseType === 'text', the SDK returns the body as a string,
    // but the typings don't reflect that — so coerce explicitly.
    return typeof response.data === 'string'
      ? response.data
      : String(response.data);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Fetch the direct (non-recursive) contents of a Drive folder, handling
   * pagination transparently. Results are ordered folders-first, then by name.
   */
  private async fetchFolderContents(folderId: string): Promise<drive_v3.Schema$File[]> {
    const items: drive_v3.Schema$File[] = [];
    let pageToken: string | undefined;

    do {
      const params: drive_v3.Params$Resource$Files$List = {
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size, modifiedTime, parents)',
        orderBy: 'folder,name',
        pageSize: 1000,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        ...(pageToken != null && { pageToken }),
      };

      const response = await this.drive.files.list(params);
      items.push(...(response.data.files ?? []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken != null);

    return items;
  }
}
