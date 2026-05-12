/**
 * Tests for the migration service.
 *
 * Design decisions:
 *
 *  1. GoogleDriveClient is mocked with vi.hoisted() so the spy references
 *     survive vi.resetModules() and can be reconfigured per test.
 *
 *  2. The logger is mocked to prevent pino-pretty from spawning a worker
 *     thread and to allow spy assertions on warn/error calls.
 *
 *  3. vi.resetModules() is called in beforeEach so each test gets fresh
 *     module-level singletons: empty queues AND driveClient = undefined.
 *     Because the mock is registered before any import, the fresh import of
 *     migration-service will call the factory mock for GoogleDriveClient.
 *
 *  4. movie-repository and genre-repository are also reset (part of the same
 *     module graph), so each test starts with an empty movie catalog and the
 *     13 default genres.
 *
 * Run with: `vitest run src/service/migration-service.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriveEntry } from '../clients/google-drive-client.js';

// ---------------------------------------------------------------------------
// Hoisted mock functions — survive vi.resetModules()
// ---------------------------------------------------------------------------

const mockListDirectory = vi.hoisted(() => vi.fn<[string], Promise<DriveEntry[]>>());
const mockGetFileContent = vi.hoisted(() => vi.fn<[string], Promise<string>>());

vi.mock('../clients/google-drive-client.js', () => ({
  GoogleDriveClient: {
    fromEnv: vi.fn(() => ({
      listDirectory: mockListDirectory,
      getFileContent: mockGetFileContent,
    })),
  },
}));

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Types for dynamic imports
// ---------------------------------------------------------------------------

type MigrationModule   = typeof import('./migration-service.js');
type MovieRepoModule   = typeof import('../repository/movie-repository.js');
type GenreServiceModule = typeof import('./genre-service.js');
type LoggerModule      = typeof import('../logger.js');

// ---------------------------------------------------------------------------
// Per-test module refresh
// ---------------------------------------------------------------------------

let migration: MigrationModule;
let movieRepo: MovieRepoModule;
let genreService: GenreServiceModule;
let logger: LoggerModule['logger'];

beforeEach(async () => {
  vi.resetModules();
  mockListDirectory.mockReset();
  mockGetFileContent.mockReset();

  migration   = await import('./migration-service.js')          as MigrationModule;
  movieRepo   = await import('../repository/movie-repository.js') as MovieRepoModule;
  genreService = await import('./genre-service.js')              as GenreServiceModule;
  const logMod = await import('../logger.js')                    as LoggerModule;
  logger = logMod.logger;
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A valid folder ID that passes the route's regex (10–128 alphanumeric/hyphen/underscore). */
const ROOT_ID = 'root1234567890';

function makeFileEntry(name: string, mimeType = 'application/json'): DriveEntry {
  return { kind: 'file', id: `id-${name}`, name, mimeType };
}

function makeFolderEntry(name: string): DriveEntry {
  return {
    kind: 'folder',
    id: `id-${name}`,
    name,
    mimeType: 'application/vnd.google-apps.folder',
  };
}

function makeMovieJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    title: 'Alien',
    year: 1979,
    rating: 8.5,
    genre: 'Sci-Fi',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// isJsonFile — tested indirectly via processDirectory behaviour
// ---------------------------------------------------------------------------

describe('isJsonFile() — MIME type + extension guard (tested via processDirectory)', () => {
  it('enqueues a file with mimeType=application/json and .json extension for download', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(makeMovieJson());

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(mockGetFileContent).toHaveBeenCalledOnce();
  });

  it('accepts a .JSON extension (case-insensitive check)', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('MOVIE.JSON')]);
    mockGetFileContent.mockResolvedValueOnce(makeMovieJson());

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(mockGetFileContent).toHaveBeenCalledOnce();
  });

  it('skips a .ipynb file even though its mimeType is application/json', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('notebook.ipynb', 'application/json')]);

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(mockGetFileContent).not.toHaveBeenCalled();
  });

  it('skips a file whose mimeType is not application/json even if the extension is .json', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('data.json', 'text/plain')]);

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(mockGetFileContent).not.toHaveBeenCalled();
  });

  it('skips a non-JSON file and logs an info message', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('readme.txt', 'text/plain')]);

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'readme.txt' }),
      expect.stringContaining('skipping'),
    );
  });
});

// ---------------------------------------------------------------------------
// toMovieInput — tested indirectly via processFile behaviour
// ---------------------------------------------------------------------------

describe('toMovieInput() — payload reshaping (tested via processFile)', () => {
  it('wraps a singular "genre" field into a "genres" array', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(JSON.stringify({
      title: 'Alien', year: 1979, rating: 8.5, genre: 'Sci-Fi',
    }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    const movies = movieRepo.movieRepository.findAll();
    expect(movies).toHaveLength(1);
    expect(movies[0]?.genres).toContain('Sci-Fi');
  });

  it('skips a file whose JSON payload is not an object (e.g. an array)', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(JSON.stringify([1, 2, 3]));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('not an object'),
    );
  });

  it('skips a file whose JSON payload is null', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce('null');

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
  });

  it('passes title, rating, and year through unchanged', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(JSON.stringify({
      title: 'Alien', year: 1979, rating: 8.5, genre: 'Sci-Fi',
    }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    const movie = movieRepo.movieRepository.findAll()[0];
    expect(movie?.title).toBe('Alien');
    expect(movie?.year).toBe(1979);
    expect(movie?.rating).toBe(8.5);
  });
});

// ---------------------------------------------------------------------------
// processDirectory
// ---------------------------------------------------------------------------

describe('processDirectory()', () => {
  it('enqueues a subdirectory found in the listing for recursive processing', async () => {
    // Root → sub-folder → movie.json
    mockListDirectory
      .mockResolvedValueOnce([makeFolderEntry('subdir')])
      .mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(makeMovieJson());

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(mockListDirectory).toHaveBeenCalledTimes(2);
    expect(movieRepo.movieRepository.findAll()).toHaveLength(1);
  });

  it('handles an empty folder listing without error', async () => {
    mockListDirectory.mockResolvedValueOnce([]);

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
  });

  it('logs an error and continues when listDirectory() throws', async () => {
    mockListDirectory.mockRejectedValueOnce(new Error('Drive API unavailable'));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ folderId: ROOT_ID }),
      expect.stringContaining('failed to list folder'),
    );
  });

  it('processes multiple files within the same folder', async () => {
    mockListDirectory.mockResolvedValueOnce([
      makeFileEntry('movie1.json'),
      makeFileEntry('movie2.json'),
    ]);
    mockGetFileContent
      .mockResolvedValueOnce(makeMovieJson({ title: 'Movie One' }))
      .mockResolvedValueOnce(makeMovieJson({ title: 'Movie Two', year: 1980 }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(movieRepo.movieRepository.findAll()).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// processFile
// ---------------------------------------------------------------------------

describe('processFile()', () => {
  it('logs an error and continues when getFileContent() throws', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('broken.json')]);
    mockGetFileContent.mockRejectedValueOnce(new Error('Network timeout'));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.error)).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'broken.json' }),
      expect.stringContaining('failed to download file'),
    );
    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
  });

  it('logs a warning and skips the file when content is not valid JSON', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('bad.json')]);
    mockGetFileContent.mockResolvedValueOnce('{ this is not json }');

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'bad.json' }),
      expect.stringContaining('invalid JSON'),
    );
    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
  });

  it('logs a warning and skips when the movie payload fails service validation', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('invalid-movie.json')]);
    // rating out of range → will fail validateMovieInput
    mockGetFileContent.mockResolvedValueOnce(JSON.stringify({
      title: 'Bad Movie', year: 2000, rating: 99, genre: 'Action',
    }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'invalid-movie.json' }),
      expect.stringContaining('validation failed'),
    );
    expect(movieRepo.movieRepository.findAll()).toHaveLength(0);
  });

  it('auto-creates unknown genres via ensureGenre before upserting', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(JSON.stringify({
      title: 'Anime Movie', year: 2000, rating: 7.5, genre: 'Anime', // 'Anime' not in defaults
    }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(genreService.isValidGenre('Anime')).toBe(true);
    expect(movieRepo.movieRepository.findAll()).toHaveLength(1);
  });

  it('logs "created movie" when the upsert creates a new record', async () => {
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('movie.json')]);
    mockGetFileContent.mockResolvedValueOnce(makeMovieJson());

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alien' }),
      expect.stringContaining('created movie'),
    );
  });

  it('logs "merged genres" when the upsert adds genres to an existing record', async () => {
    // First file creates the movie with Sci-Fi
    mockListDirectory.mockResolvedValueOnce([
      makeFileEntry('movie1.json'),
      makeFileEntry('movie2.json'),
    ]);
    mockGetFileContent
      .mockResolvedValueOnce(makeMovieJson({ genre: 'Sci-Fi' }))
      .mockResolvedValueOnce(makeMovieJson({ genre: 'Horror' })); // same identity, new genre

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alien', addedGenres: ['Horror'] }),
      expect.stringContaining('merged genres'),
    );
  });

  it('logs "no-op" when the movie already has all genres in the file', async () => {
    mockListDirectory.mockResolvedValueOnce([
      makeFileEntry('movie1.json'),
      makeFileEntry('movie2.json'),
    ]);
    // Both files describe the same movie with the same genre
    mockGetFileContent
      .mockResolvedValueOnce(makeMovieJson({ genre: 'Sci-Fi' }))
      .mockResolvedValueOnce(makeMovieJson({ genre: 'Sci-Fi' }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Alien' }),
      expect.stringContaining('no-op'),
    );
  });
});

// ---------------------------------------------------------------------------
// startMigration / waitForIdle
// ---------------------------------------------------------------------------

describe('startMigration()', () => {
  it('enqueues the root folder for processing and returns immediately', () => {
    // startMigration() is synchronous (void return) — it just enqueues
    mockListDirectory.mockResolvedValue([]);

    expect(() => migration.startMigration(ROOT_ID)).not.toThrow();
    // Don't wait — just checking it doesn't block
  });

  it('after waitForIdle() all reachable JSON files have been processed', async () => {
    mockListDirectory.mockResolvedValueOnce([
      makeFolderEntry('sub'),
      makeFileEntry('root.json'),
    ]);
    // sub-folder
    mockListDirectory.mockResolvedValueOnce([makeFileEntry('sub.json')]);
    mockGetFileContent
      .mockResolvedValueOnce(makeMovieJson({ title: 'Root Movie' }))
      .mockResolvedValueOnce(makeMovieJson({ title: 'Sub Movie', year: 1980 }));

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    expect(movieRepo.movieRepository.size).toBe(2);
  });
});

describe('waitForIdle()', () => {
  it('resolves immediately when the queues are already empty', async () => {
    // No migration started — queues are empty
    await expect(migration.waitForIdle()).resolves.toBeUndefined();
  });

  it('resolves only after the file queue has finished processing all enqueued files', async () => {
    let resolveFile!: () => void;
    const slowFile = new Promise<string>(resolve => { resolveFile = () => resolve(makeMovieJson()); });

    mockListDirectory.mockResolvedValueOnce([makeFileEntry('slow.json')]);
    mockGetFileContent.mockReturnValueOnce(slowFile);

    migration.startMigration(ROOT_ID);

    let idleResolved = false;
    const idlePromise = migration.waitForIdle().then(() => { idleResolved = true; });

    // Give the queues a tick to pick up work
    await new Promise(r => setTimeout(r, 10));
    expect(idleResolved).toBe(false); // still waiting for the slow file

    resolveFile();
    await idlePromise;
    expect(idleResolved).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// shutdown()
// ---------------------------------------------------------------------------

describe('shutdown()', () => {
  it('resolves cleanly and logs "drained" when queues are empty before the timeout', async () => {
    mockListDirectory.mockResolvedValue([]);

    migration.startMigration(ROOT_ID);
    await migration.waitForIdle();

    await migration.shutdown(5_000);

    expect(vi.mocked(logger.info)).toHaveBeenCalledWith(
      expect.stringContaining('drained cleanly'),
    );
  });

  it('resolves after timeoutMs and logs a warning when in-flight tasks do not finish', async () => {
    // A mock that never resolves — will hang the queue
    mockListDirectory.mockImplementation(() => new Promise(() => {}));

    migration.startMigration(ROOT_ID);

    // Give the queue one tick to pick up the work
    await new Promise(r => setTimeout(r, 10));

    await migration.shutdown(50); // very short timeout

    expect(vi.mocked(logger.warn)).toHaveBeenCalledWith(
      expect.objectContaining({ timeoutMs: 50 }),
      expect.stringContaining('timed out'),
    );
  });

  it('the timeout warning log includes the count of remaining pending tasks', async () => {
    mockListDirectory.mockImplementation(() => new Promise(() => {}));
    migration.startMigration(ROOT_ID);
    await new Promise(r => setTimeout(r, 10));

    await migration.shutdown(50);

    const warnCall = vi.mocked(logger.warn).mock.calls.find(
      ([, msg]) => typeof msg === 'string' && msg.includes('timed out'),
    );
    expect(warnCall).toBeDefined();
    const meta = warnCall?.[0] as Record<string, unknown>;
    expect(typeof meta['dirPending']).toBe('number');
    expect(typeof meta['filePending']).toBe('number');
  });

  it('pauses both queues so no new tasks are started after shutdown is called', async () => {
    mockListDirectory.mockResolvedValue([]);
    await migration.shutdown(100);

    // After shutdown, enqueueing new work should not trigger listDirectory again
    mockListDirectory.mockResolvedValue([makeFileEntry('post-shutdown.json')]);
    migration.startMigration(ROOT_ID);
    await new Promise(r => setTimeout(r, 50));

    // listDirectory is paused — it should not have been called
    expect(mockListDirectory).not.toHaveBeenCalled();
  });

  it('accepts a custom timeoutMs argument', async () => {
    // Should resolve within a generous window even when timing is tight
    await expect(migration.shutdown(200)).resolves.toBeUndefined();
  });
});
