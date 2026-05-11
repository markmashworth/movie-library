/**
 * Idempotency middleware factory.
 *
 * When a request carries an `Idempotency-Key` header the middleware:
 *   1. Checks the in-process cache.  If a non-expired entry exists it replays
 *      the stored status + body and short-circuits the handler.
 *   2. Otherwise it intercepts `res.json` to capture the outgoing body, then
 *      on `res.on('finish')` stores the response under the key for 24 h.
 *
 * The cache is a module-level singleton `Map` — no external storage.  A
 * background timer evicts expired entries every 5 minutes.  The timer is
 * unref'd so it does not keep the Node event loop alive after all other work
 * is done.
 *
 * Apply this middleware to POST endpoints only.  GET/HEAD are inherently
 * idempotent; wrapping them with this middleware would be misleading.
 *
 * Error responses (5xx) are intentionally NOT cached: a server-side failure
 * should be retryable, not replayed indefinitely.
 */

import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { logger } from '../logger.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TTL_MS              = 24 * 60 * 60 * 1_000; // 24 hours
const EVICTION_INTERVAL_MS =  5 * 60 * 1_000;      // 5 minutes
// Express lower-cases all header names.
const HEADER = 'idempotency-key';

// ---------------------------------------------------------------------------
// Cache — module-level singleton shared across all usages of the factory
// ---------------------------------------------------------------------------

interface CacheEntry {
  status:    number;
  body:      unknown;
  expiresAt: number; // absolute ms timestamp
}

const store = new Map<string, CacheEntry>();

// Periodic eviction — runs in the background and doesn't block process exit.
const evictionTimer = setInterval(() => {
  const now = Date.now();
  let evicted = 0;

  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) {
      store.delete(key);
      evicted++;
    }
  }

  if (evicted > 0) {
    logger.info(
      { evicted, remaining: store.size },
      '[idempotency] evicted expired cache entries',
    );
  }
}, EVICTION_INTERVAL_MS);

// Unref so the timer won't prevent a clean shutdown once everything else is done.
evictionTimer.unref();

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns an Express `RequestHandler` that enforces idempotency via the
 * `Idempotency-Key` request header.
 *
 * The underlying cache is a module-level singleton — calling the factory
 * multiple times (e.g. once per route) shares a single store rather than
 * creating separate ones.
 */
export function idempotency(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = req.headers[HEADER];

    // No header → caller is not requesting idempotency; fall through normally.
    if (typeof key !== 'string' || key.length === 0) {
      next();
      return;
    }

    const now = Date.now();
    const cached = store.get(key);

    if (cached !== undefined && cached.expiresAt > now) {
      // Cache hit — replay the original response and skip the real handler.
      logger.info({ key, status: cached.status }, '[idempotency] replaying cached response');
      res.status(cached.status).json(cached.body);
      return;
    }

    // Cache miss — intercept res.json to capture the body.
    // res.statusCode is set by res.status() before res.json() is called, so
    // reading it inside the override always yields the correct final value.
    let capturedBody: unknown;

    const originalJson = res.json.bind(res);
    res.json = ((body?: unknown) => {
      capturedBody = body;
      return originalJson(body);
    }) as typeof res.json;

    // After the response is fully sent, persist it for future replays.
    // Skip 5xx so server errors remain retryable.
    res.on('finish', () => {
      if (res.statusCode < 500) {
        store.set(key, {
          status:    res.statusCode,
          body:      capturedBody,
          expiresAt: now + TTL_MS,
        });
        logger.info(
          { key, status: res.statusCode },
          '[idempotency] cached response',
        );
      }
    });

    next();
  };
}
