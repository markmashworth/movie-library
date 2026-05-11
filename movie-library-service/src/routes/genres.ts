/**
 * Routes for /v1/genres
 *   GET  /genres      — returns the canonical, sorted genre list
 *   POST /genres      — adds a new genre; body: { "name": "string" }
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { getGenres, addGenre } from '../service/genre-service.js';

export const genresRouter = Router();

genresRouter.get('/', (_req: Request, res: Response) => {
  res.json({ genres: getGenres() });
});

genresRouter.post('/', (req: Request, res: Response) => {
  const { name } = req.body as { name?: unknown };
  const result = addGenre(name);

  if (!result.ok) {
    if (result.kind === 'duplicate') {
      res.status(409).json({ error: 'Genre already exists.' });
    } else {
      res.status(400).json({ error: result.message });
    }
    return;
  }

  res.status(201).json({ genre: result.genre });
});
