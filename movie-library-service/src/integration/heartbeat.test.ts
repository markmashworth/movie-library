/**
 * Integration test: /heartbeat endpoint
 *
 * Spawns the real Express server as a child process (no mocks), waits for it
 * to be ready, then asserts that GET /heartbeat returns a 2xx status code.
 *
 * Run with: `npm run test:integration`
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const PORT = 8080;
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 15_000;
const POLL_INTERVAL_MS = 250;

// Absolute paths derived from this file's location so spawn works correctly
// regardless of which directory vitest is invoked from.
// This file lives at: src/integration/heartbeat.test.ts
// URL resolution strips the filename first, so '../..' traverses:
//   integration/ → src/ → service root (movie-library-service/)
const SERVICE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TSX_BIN = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/heartbeat`);
      if (res.ok) return;
    } catch {
      // Server not ready yet — keep polling.
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Server did not become ready within ${STARTUP_TIMEOUT_MS}ms`);
}

describe('Integration: heartbeat', () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn(
      TSX_BIN,
      ['--no-deprecation', 'index.ts'],
      {
        cwd: SERVICE_ROOT,
        env: { ...process.env },
        // Suppress server log output in test runs; stderr still surfaces on
        // process crash so failures remain diagnosable.
        stdio: ['ignore', 'ignore', 'pipe'],
      },
    );

    // Surface unexpected startup errors.
    server.stderr?.on('data', (chunk: Buffer) => {
      process.stderr.write(chunk);
    });

    await waitForServer();
  }, STARTUP_TIMEOUT_MS + 5_000);

  afterAll(() => {
    server.kill('SIGTERM');
  });

  it('GET /heartbeat returns a 2xx status code', async () => {
    const response = await fetch(`${BASE_URL}/heartbeat`);
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
  });
});
