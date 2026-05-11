/**
 * Routes for /v1/migration
 *   POST /migration — kick off a Google Drive → movie library migration
 *
 * The endpoint is fire-and-forget: it enqueues the supplied root folder ID on
 * the migration service's directory queue and returns 202 immediately. Actual
 * traversal and persistence run on background workers.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { startMigration } from '../service/migration-service.js';
import { idempotency, getSharedIdempotencyService } from 'express-idempotency';

export const migrationRouter = Router();

// ---------------------------------------------------------------------------
// POST /migration
// ---------------------------------------------------------------------------
migrationRouter.post('/', idempotency(), (req: Request, res: Response) => {
  // The middleware always calls next() — even when replaying a cached response.
  // Guard here so we don't kick off a duplicate migration on a replayed request.
  if (getSharedIdempotencyService().isHit(req)) return;

  const body = (req.body ?? {}) as { rootFolderId?: unknown };
  const rootFolderId = body.rootFolderId;

  if (typeof rootFolderId !== 'string' || rootFolderId.length === 0) {
    res.status(400).json({
      error: 'invalid_parameter',
      message: '`rootFolderId` is required and must be a non-empty string.',
    });
    return;
  }

  startMigration(rootFolderId);

  res.status(202).json({
    status: 'accepted',
    message: 'Migration started. Progress is logged to the server console.',
    rootFolderId,
  });
});
