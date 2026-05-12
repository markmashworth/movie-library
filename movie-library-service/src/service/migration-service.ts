/**
 * Migration service — recursively walks a Google Drive folder tree, parses each
 * JSON file into a movie, and persists it via the movie service.
 *
 * The traversal is driven by two independent in-memory p-queues:
 *
 *   directoryQueue – one task per folder. Lists the folder's children. Each
 *                    subfolder is re-enqueued on the directoryQueue; each JSON
 *                    file is enqueued on the fileQueue.
 *   fileQueue      – one task per file. Downloads the file's contents,
 *                    validates it shapes into a movie, and persists it via
 *                    movie-service.
 */

/**
 * Errors are logged and the offending unit of work is skipped — the migration as a
 * whole keeps running.
 * 
 * In a productionized service, this would be replaced with a more robust
 * error handling and retry mechanism via a distributed queue with DLQs
 * and a persistent store for resumability and progress tracking.
 */

import PQueue from 'p-queue';
import { GoogleDriveClient } from '../clients/google-drive-client.js';
import type { DriveEntry } from '../clients/google-drive-client.js';
import { upsertMovie } from './movie-service.js';
import { ensureGenre } from './genre-service.js';
import { logger } from '../logger.js';

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
  logger.info({ rootFolderId }, '[migration] enqueueing root folder');
  enqueueDirectory(rootFolderId);
}

/**
 * Gracefully shuts down the migration queues.
 *
 * Pauses both queues so no new tasks are started, then waits up to
 * `timeoutMs` for any in-flight tasks to complete. If the timeout fires,
 * logs how many tasks remain so operators know what was abandoned.
 *
 * @param timeoutMs Maximum time (ms) to wait for queues to drain. Default 15 000.
 */
export async function shutdown(timeoutMs = 15_000): Promise<void> {
  // Prevent the queues from picking up any further work while we drain.
  directoryQueue.pause();
  fileQueue.pause();

  logger.info('[migration] shutdown requested — waiting for in-flight tasks to complete');

  // Wait for both queues to finish their currently-running tasks.
  const drainQueues = async (): Promise<void> => {
    await directoryQueue.onIdle();
    await fileQueue.onIdle();
  };

  let timedOut = false;

  await Promise.race([
    drainQueues(),
    // Resolve the race after timeoutMs and flag that we ran out of time.
    new Promise<void>((resolve) =>
      setTimeout(() => {
        timedOut = true;
        resolve();
      }, timeoutMs),
    ),
  ]);

  if (timedOut) {
    // Report how many queued (not yet started) tasks had to be abandoned.
    const dirPending = directoryQueue.size + directoryQueue.pending;
    const filePending = fileQueue.size + fileQueue.pending;
    logger.warn(
      { timeoutMs, dirPending, filePending },
      '[migration] shutdown timed out — tasks left pending',
    );
  } else {
    logger.info('[migration] all queues drained cleanly');
  }
}

/**
 * Resolves once both queues have drained. Useful for tests or for callers
 * that want a synchronous response after the entire walk completes.
 */
export async function waitForIdle(): Promise<void> {
  // Drain both queues, alternating, until each is idle and stays idle.
  // Because the directory queue feeds the file queue, both must be checked
  // again after each round.
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
    logger.error({ err, folderId }, '[migration] failed to list folder');
    return;
  }

  for (const entry of entries) {
    if (entry.kind === 'folder') {
      enqueueDirectory(entry.id);
    } else if (isJsonFile(entry.mimeType, entry.name)) {
      enqueueFile(entry.id, entry.name);
    } else {
      logger.info(
        { fileName: entry.name, mimeType: entry.mimeType },
        '[migration] skipping non-JSON file',
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
    logger.error({ err, fileId, fileName }, '[migration] failed to download file');
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logger.warn(
      { fileId, fileName, err },
      '[migration] skipping file — invalid JSON',
    );
    return;
  }

  const movieInput = toMovieInput(parsed);
  if (!movieInput) {
    logger.warn(
      { fileId, fileName },
      '[migration] skipping file — payload is not an object with the expected shape',
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
    logger.warn(
      { fileId, fileName, errors: result.errors },
      '[migration] skipping file — validation failed',
    );
    return;
  }

  const { movie, created, addedGenres } = result;
  if (created) {
    logger.info(
      { movieId: movie.id, title: movie.title, genres: movie.genres },
      '[migration] created movie',
    );
  } else if (addedGenres.length > 0) {
    logger.info(
      { movieId: movie.id, title: movie.title, addedGenres },
      '[migration] merged genres into existing movie',
    );
  } else {
    logger.info(
      { movieId: movie.id, title: movie.title },
      '[migration] no-op — movie already had all genres',
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
