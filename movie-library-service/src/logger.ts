/**
 * Shared application logger — a single pino instance used by every layer of
 * the service (HTTP middleware, routes, services, shutdown handler).
 *
 * Output is newline-delimited JSON so logs are grep/jq-friendly out of the
 * box. No pretty-printing: use `| pino-pretty` locally if you want it.
 *
 * Level precedence:
 *   1. LOG_LEVEL environment variable (e.g. "debug", "warn")
 *   2. "info" (hard-coded default)
 */

import pino from 'pino';

export const logger = pino(
  process.env.LOG_PRETTY === 'true'
    ? { level: process.env.LOG_LEVEL ?? 'info', transport: { target: 'pino-pretty' } }
    : { level: process.env.LOG_LEVEL ?? 'info' },
);