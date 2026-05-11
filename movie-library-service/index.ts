import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pinoHttp from 'pino-http';
import { moviesRouter } from './src/routes/movies.js';
import { genresRouter } from './src/routes/genres.js';
import { migrationRouter } from './src/routes/migration.js';
import { shutdown as shutdownMigration } from './src/service/migration-service.js';
import { logger } from './src/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = 8080;

const API_V1_PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Middleware — pino-http must come first so req.id and req.log are available
// to everything downstream, including the error handler.
// The built-in genReqId is used (no custom generator): it honours an incoming
// x-request-id header and falls back to a UUID for every new request.
// ---------------------------------------------------------------------------
app.use(pinoHttp({
  logger,
  serializers: {
    // Trim request fields to the useful subset.
    req(req) {
      return {
        id:     req.id,
        method: req.method,
        url:    req.url,
        params: req.params,
      };
    },
    // Only keep the status code from the response object.
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
}));
app.use(express.json());

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/heartbeat', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Routes — all mounted under /api/v1
// ---------------------------------------------------------------------------
app.use(`${API_V1_PREFIX}/movies`, moviesRouter);
app.use(`${API_V1_PREFIX}/genres`, genresRouter);
app.use(`${API_V1_PREFIX}/migration`, migrationRouter);

// ---------------------------------------------------------------------------
// Global error handler
// ---------------------------------------------------------------------------
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    // req.id is stamped by pino-http on every request.
    const requestId = req.id;
    logger.error({ err, requestId }, 'Unhandled request error');
    res.status(500).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred.',
      requestId,
    });
  },
);

// ---------------------------------------------------------------------------
// Swagger UI — served at /docs
// ---------------------------------------------------------------------------
const openApiSpec = JSON.parse(
  readFileSync(join(__dirname, 'openapi.json'), 'utf-8'),
);

app.get('/docs/openapi.json', (_req, res) => {
  res.json(openApiSpec);
});

app.get('/docs', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'swagger.html'));
});

// ---------------------------------------------------------------------------
// Start — capture the server handle so the shutdown handler can close it.
// ---------------------------------------------------------------------------
const server = app.listen(PORT, () => {
  logger.info(`Movie Library API running at http://localhost:${PORT}/api/v1`);
  logger.info(`Swagger UI available at  http://localhost:${PORT}/docs`);
});

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

// Guard so that a second signal doesn't re-enter the shutdown sequence.
let isShuttingDown = false;

/**
 * Coordinates an orderly shutdown on SIGTERM / SIGINT:
 *   1. Stop accepting new HTTP connections.
 *   2. Drain the migration queues (inner timeout: 15 s).
 *   3. Exit — code 0 on clean drain, code 1 if the outer deadline (20 s) fires.
 */
async function shutdown(signal: string): Promise<void> {
  // Idempotency guard — ignore repeated signals.
  if (isShuttingDown) {
    logger.info(`[server] already shutting down, ignoring ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info({ signal }, '[server] received signal — starting graceful shutdown');

  // Step 1: stop the HTTP server from accepting new requests.
  // In-flight requests continue until their handlers return.
  server.close(() => logger.info('[server] HTTP server closed'));

  // Step 2 + 3: drain queues with an inner 15 s budget, but give the whole
  // sequence at most 20 s before forcing an exit with a non-zero code.
  const OUTER_TIMEOUT_MS = 20_000;
  let outerTimedOut = false;

  await Promise.race([
    // Let the migration service pause its queues and wait for in-flight tasks.
    shutdownMigration(15_000),
    // Hard outer deadline — if anything hangs past this we force-exit.
    new Promise<void>((resolve) =>
      setTimeout(() => {
        outerTimedOut = true;
        resolve();
      }, OUTER_TIMEOUT_MS),
    ),
  ]);

  if (outerTimedOut) {
    logger.error('[server] graceful shutdown timed out — forcing exit with code 1');
    process.exit(1);
  }

  logger.info('[server] graceful shutdown complete');
  process.exit(0);
}

// Register signal handlers. `void` suppresses the floating-promise lint warning
// since signal handlers cannot be async by the Node API contract.
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT',  () => { void shutdown('SIGINT'); });
