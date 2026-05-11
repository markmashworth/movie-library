import express from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { moviesRouter } from './src/routes/movies.js';
import { genresRouter } from './src/routes/genres.js';
import { migrationRouter } from './src/routes/migration.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app  = express();
const PORT = 8080;

const API_V1_PREFIX = '/api/v1';

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
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
    _req: express.Request,
    res: express.Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({
      error: 'internal_server_error',
      message: 'An unexpected error occurred.',
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
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Movie Library API running at http://localhost:${PORT}/api/v1`);
  console.log(`Swagger UI available at  http://localhost:${PORT}/docs`);
});
