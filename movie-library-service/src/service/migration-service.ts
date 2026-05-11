/**
 * Migration service — recursively walks a Google Drive folder tree, parses each
 * JSON file into a movie, and persists it via the movie service.
 *
 * The traversal is driven by two independent in-memory queues (p-queue):
 *
 *   directoryQueue – one task per folder. Lists the folder's children. Each
 *                    subfolder is re-enqueued on the directoryQueue; each JSON
 *                    file is enqueued on the fileQueue.
 *
 *   fileQueue      – one task per file. Downloads the file's contents,
 *                    validates it shapes into a movie, and persists it via
 *                    movie-service.
 *
 * Both queues share the same singleton GoogleDriveClient. Errors are logged
 * and the offending unit of work is skipped — the migration as a whole keeps
 * running. In a productionized service, this would be replaced with a more
 * robust error handling and retry mechanism via a distributed queue.
 */

import PQueue from 'p-queue';
import { GoogleDriveClient } from '../clients/google-drive-client.js';
import type { DriveEntry } from '../clients/google-drive-client.js';
import { upsertMovie } from './movie-service.js';
import { ensureGenre } from './genre-service.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const JSON_MIME_TYPE = 'application/json';
const DIRECTORY_QUEUE_CONCURRENCY = 10;
const FILE_QUEUE_CONCURRENCY = 10;

// ---------------------------------------------------------------------------
// Module-level singletons
// ---------------------------------------------------------------------------

/**
 * Lazy GoogleDriveClient — instantiated on first use so that tests and other
 * code paths that don't touch migration aren't required to set the OAuth env
 * vars.
 */
let driveClient: GoogleDriveClient | undefined;
function getDriveClient(): GoogleDriveClient {
  if (!driveClient) {
    driveClient = GoogleDriveClient.fromEnv();
  }
  return driveClient;
}

/**
 * Both queues are module-level singletons so that repeated calls to
 * {@link startMigration} share concurrency limits. Tasks added to a p-queue
 * begin executing immediately — there is no separate "worker" loop to start.
 */
const directoryQueue = new PQueue({ concurrency: DIRECTORY_QUEUE_CONCURRENCY });
const fileQueue = new PQueue({ concurrency: FILE_QUEUE_CONCURRENCY });

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Kick off a migration rooted at the given Google Drive folder ID.
 *
 * Returns immediately after enqueueing the root — traversal and persistence
 * happen asynchronously on the background queues. Callers that need to wait
 * for completion can `await waitForIdle()`.
 */
export function startMigration(rootFolderId: string): void {
  console.log(`[migration] enqueueing root folder ${rootFolderId}`);
  enqueueDirectory(rootFolderId);
}

/**
 * Resolves once both queues have drained. Useful for tests or for callers
 * that want a synchronous response after the entire walk completes.
 */
export async function waitForIdle(): Promise<void> {
  // Drain both queues, alternating, until each is idle and stays idle.
  // Because the directory queue feeds the file queue, both must be checked
  // again after each round.
  /* eslint-disable no-constant-condition */
  while (true) {
    await directoryQueue.onIdle();
    await fileQueue.onIdle();
    if (directoryQueue.size === 0 && directoryQueue.pending === 0 &&
        fileQueue.size === 0 && fileQueue.pending === 0) {
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Directory worker
// ---------------------------------------------------------------------------

function enqueueDirectory(folderId: string): void {
  void directoryQueue.add(() => processDirectory(folderId));
}

async function processDirectory(folderId: string): Promise<void> {
  let entries: DriveEntry[];
  try {
    entries = await getDriveClient().listDirectory(folderId);
  } catch (err) {
    console.error(`[migration] failed to list folder ${folderId}:`, err);
    return;
  }

  for (const entry of entries) {
    if (entry.kind === 'folder') {
      enqueueDirectory(entry.id);
    } else if (isJsonFile(entry.mimeType, entry.name)) {
      enqueueFile(entry.id, entry.name);
    } else {
      console.log(
        `[migration] skipping non-JSON file ${entry.name} (${entry.mimeType})`,
      );
    }
  }
}

/**
 * Drive reports `application/json` as the mimeType for any JSON-shaped file —
 * including Jupyter notebooks (`.ipynb`), which are JSON internally. Requiring
 * BOTH the mimeType and the `.json` extension keeps notebooks (and other
 * incidentally-JSON formats) out of the migration without a wasted download +
 * parse + validation cycle per file.
 */
function isJsonFile(mimeType: string, name: string): boolean {
  return mimeType === JSON_MIME_TYPE && name.toLowerCase().endsWith('.json');
}

// ---------------------------------------------------------------------------
// File worker
// ---------------------------------------------------------------------------

function enqueueFile(fileId: string, fileName: string): void {
  void fileQueue.add(() => processFile(fileId, fileName));
}

async function processFile(fileId: string, fileName: string): Promise<void> {
  let raw: string;
  try {
    raw = await getDriveClient().getFileContent(fileId);
  } catch (err) {
    console.error(`[migration] failed to download file ${fileName} (${fileId}):`, err);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[migration] skipping ${fileName} (${fileId}): invalid JSON — ${(err as Error).message}`,
    );
    return;
  }

  const movieInput = toMovieInput(parsed);
  if (!movieInput) {
    console.warn(
      `[migration] skipping ${fileName} (${fileId}): payload is not an object with the expected shape`,
    );
    return;
  }

  // Auto-create any genres that don't yet exist — migration only. Regular
  // movie creation rejects unknown genres instead of silently creating them.
  if (Array.isArray(movieInput.genres)) {
    for (const genre of movieInput.genres) {
      if (typeof genre === 'string') {
        ensureGenre(genre);
      }
    }
  }

  // upsertMovie -> movieRepository.upsert is fully synchronous between the
  // identity lookup and the index writes. Even though many file workers run
  // concurrently here, two workers persisting the same (title, year, rating)
  // cannot race: Node runs JS on one thread, so the second caller will
  // always observe the first caller's write and merge into it. See the
  // concurrency note at the top of movie-repository.ts.
  const result = upsertMovie(movieInput);
  if (!result.ok) {
    const reasons = result.errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    console.warn(`[migration] skipping ${fileName} (${fileId}): ${reasons}`);
    return;
  }

  const { movie, created, addedGenres } = result;
  if (created) {
    console.log(
      `[migration] created "${movie.title}" (id=${movie.id}, genres=[${movie.genres.join(', ')}])`,
    );
  } else if (addedGenres.length > 0) {
    console.log(
      `[migration] merged genres [${addedGenres.join(', ')}] into "${movie.title}" (id=${movie.id})`,
    );
  } else {
    console.log(
      `[migration] no-op for "${movie.title}" (id=${movie.id}) — already had all genres`,
    );
  }
}

/**
 * Reshape the raw JSON payload into the input format expected by
 * `movie-service.createMovie`. The on-disk schema uses a singular `genre`,
 * whereas the service expects `genres: string[]` — so we wrap it.
 *
 * Returns `undefined` if the payload isn't an object; deeper validation
 * (types, allowed genres, year/rating ranges) is delegated to createMovie.
 */
function toMovieInput(payload: unknown): Record<string, unknown> | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return undefined;
  }

  const raw = payload as Record<string, unknown>;
  const { title, rating, year, genre } = raw;

  return {
    title,
    rating,
    year,
    genres: genre === undefined ? undefined : [genre],
  };
}
