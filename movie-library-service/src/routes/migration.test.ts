/**
 * Tests for POST /migration rootFolderId validation.
 *
 * The migration service is mocked so these tests exercise only the HTTP
 * layer: body parsing, the rootFolderId regex guard, status codes, and
 * response shapes. The actual Drive traversal is covered by
 * migration-service.test.ts.
 *
 * Run with: `vitest run src/routes/migration.test.ts`
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Application } from 'express';

// ---------------------------------------------------------------------------
// Mock: migration service — we only care that startMigration is (or isn't)
// called; we don't want it touching real Drive queues.
// ---------------------------------------------------------------------------

vi.mock('../service/migration-service.js', () => ({
  startMigration: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: express-idempotency — same passthrough strategy as movies.test.ts.
// The middleware sends a cached response on a replay, then always calls
// next() so the handler can check isHit() and exit early.
// ---------------------------------------------------------------------------

const mockIsHit = vi.hoisted(() => vi.fn(() => false));

vi.mock('express-idempotency', () => ({
  idempotency: vi.fn(() => (req: unknown, res: unknown, next: () => void) => {
    if (mockIsHit(req)) {
      (res as { status: (c: number) => { json: (b: unknown) => void } })
        .status(202).json({ replayed: true });
    }
    next();
  }),
  getSharedIdempotencyService: vi.fn(() => ({ isHit: mockIsHit })),
}));

import { migrationRouter } from './migration.js';
import { startMigration } from '../service/migration-service.js';

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(): Application {
  const app = express();
  app.use(express.json());
  app.use('/', migrationRouter);
  return app;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exact minimum-length valid ID (10 alphanumeric characters). */
const VALID_ID_10 = 'abcdef1234';

/** Sends a POST with the given body and returns the supertest response. */
async function post(body: unknown) {
  return request(buildApp()).post('/').send(body);
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  mockIsHit.mockReturnValue(false);
});

// ---------------------------------------------------------------------------
// Accepts valid input
// ---------------------------------------------------------------------------

describe('POST /migration — accepts valid rootFolderId', () => {
  it('returns 202 for a valid 10-character alphanumeric ID', async () => {
    const res = await post({ rootFolderId: VALID_ID_10 });
    expect(res.status).toBe(202);
  });

  it('returns 202 for a valid 128-character ID (upper boundary)', async () => {
    const id128 = 'a'.repeat(128);
    const res = await post({ rootFolderId: id128 });
    expect(res.status).toBe(202);
  });

  it('returns 202 for an ID containing hyphens and underscores', async () => {
    const res = await post({ rootFolderId: 'abc-DEF_123xyz' }); // 14 chars, mixed
    expect(res.status).toBe(202);
  });

  it('calls startMigration with the provided rootFolderId on a valid request', async () => {
    await post({ rootFolderId: VALID_ID_10 });
    expect(vi.mocked(startMigration)).toHaveBeenCalledWith(VALID_ID_10);
  });

  it('202 response body includes status, message, and the rootFolderId', async () => {
    const res = await post({ rootFolderId: VALID_ID_10 });
    expect(res.body).toMatchObject({
      status:       'accepted',
      rootFolderId: VALID_ID_10,
    });
    expect(typeof res.body.message).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Rejects invalid input — 400 for each invalid case
// ---------------------------------------------------------------------------

describe('POST /migration — rejects invalid rootFolderId', () => {
  it('returns 400 when rootFolderId is missing from the body', async () => {
    const res = await post({});
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId is not a string (e.g. a number)', async () => {
    const res = await post({ rootFolderId: 123456789 });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId is an empty string', async () => {
    const res = await post({ rootFolderId: '' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId is 9 characters (below the 10-character minimum)', async () => {
    const res = await post({ rootFolderId: 'a'.repeat(9) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId is 129 characters (above the 128-character maximum)', async () => {
    const res = await post({ rootFolderId: 'a'.repeat(129) });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId contains a space', async () => {
    const res = await post({ rootFolderId: 'abc def 1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId contains a slash', async () => {
    const res = await post({ rootFolderId: 'abcdef/1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId contains a dot', async () => {
    const res = await post({ rootFolderId: 'abcdef.1234' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when rootFolderId contains Unicode characters', async () => {
    const res = await post({ rootFolderId: 'abcdefé1234' }); // é
    expect(res.status).toBe(400);
  });

  it('does not call startMigration when the ID is invalid', async () => {
    await post({ rootFolderId: 'tooshort' });
    expect(vi.mocked(startMigration)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Error response shape
// ---------------------------------------------------------------------------

describe('POST /migration — 400 error response shape', () => {
  it('400 response body has error: "invalid_parameter"', async () => {
    const res = await post({ rootFolderId: 'bad' });
    expect(res.body.error).toBe('invalid_parameter');
  });

  it('400 response message mentions the 10–128 character constraint', async () => {
    const res = await post({ rootFolderId: 'bad' });
    expect(res.body.message).toContain('10');
    expect(res.body.message).toContain('128');
  });

  it('400 response mentions that rootFolderId is the problematic field', async () => {
    const res = await post({ rootFolderId: 'bad' });
    expect(res.body.message).toContain('rootFolderId');
  });

  it('400 response returns JSON content-type', async () => {
    const res = await post({ rootFolderId: 'bad' });
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });
});
