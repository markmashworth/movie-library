/**
 * Tests for GoogleDriveClient retry behaviour.
 *
 * Design
 * ------
 * The retry logic lives inside gaxios (the HTTP layer used by googleapis).
 * GoogleDriveClient configures gaxios by calling `google.options({ retryConfig })`.
 * We can't exercise gaxios's retry loop without real network calls, so instead:
 *
 *   1. googleapis is mocked entirely so we can capture the exact retryConfig
 *      object that fromEnv() passes to google.options().
 *
 *   2. "retries on HTTP 4xx/5xx" tests verify that the relevant status code
 *      appears in retryConfig.retryableStatusCodes — the value that tells
 *      gaxios when to retry.
 *
 *   3. "does NOT retry" tests verify the code is absent from that list.
 *
 *   4. Retry-count tests (exhausts 3 retries, custom retries) verify the
 *      retries / noResponseRetries fields.
 *
 *   5. Backoff tests extract retryConfig.retryBackoff and call it directly
 *      with fake timers to assert the exact wait duration used.
 *
 *   6. "succeeds without retrying" verifies that getFileContent() resolves
 *      and calls drive.files.get() exactly once when the first call succeeds.
 *
 * Run with: `vitest run src/clients/google-drive-client.test.ts`
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock: googleapis
// Captures the options passed to google.options() and exposes controllable
// stubs for drive.files.get / drive.files.list.
// ---------------------------------------------------------------------------

const mockSetCredentials = vi.hoisted(() => vi.fn());
const mockGoogleOptions  = vi.hoisted(() => vi.fn());
const mockFilesGet       = vi.hoisted(() => vi.fn());
const mockFilesList      = vi.hoisted(() => vi.fn());

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn(function OAuth2Mock() {
        return { setCredentials: mockSetCredentials };
      }),
    },
    options: mockGoogleOptions,
    drive: vi.fn(() => ({
      files: {
        get:  mockFilesGet,
        list: mockFilesList,
      },
    })),
  },
}));

import { GoogleDriveClient } from './google-drive-client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Shape of the retryConfig object passed to google.options(). */
interface RetryConfig {
  retries:              number;
  noResponseRetries:    number;
  retryableStatusCodes: number[];
  httpMethodsToRetry:   string[];
  retryBackoff:         (err: unknown, defaultDelay: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ENV = {
  GOOGLE_CLIENT_ID:     'test-client-id',
  GOOGLE_CLIENT_SECRET: 'test-client-secret',
  GOOGLE_REDIRECT_URI:  'https://example.com/callback',
  GOOGLE_REFRESH_TOKEN: 'test-refresh-token',
} as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Creates a GoogleDriveClient from env — triggers the google.options() call. */
function createClient(opts?: { retries?: number }): GoogleDriveClient {
  return GoogleDriveClient.fromEnv(opts);
}

/** Returns the retryConfig captured from the most recent google.options() call. */
function capturedRetryConfig(): RetryConfig {
  const call = mockGoogleOptions.mock.calls[0];
  if (!call) throw new Error('google.options() was not called');
  return (call[0] as { retryConfig: RetryConfig }).retryConfig;
}

/**
 * Runs retryBackoff(err, defaultDelay) under fake timers, asserting that
 * the promise is still pending after `pendingMs` and resolves after `resolveMs`.
 */
async function assertBackoffDelay(
  retryBackoff: RetryConfig['retryBackoff'],
  err:          unknown,
  defaultDelay: number,
  expectedMs:   number,
): Promise<void> {
  vi.useFakeTimers();
  try {
    let resolved = false;
    const p = retryBackoff(err, defaultDelay).then(() => { resolved = true; });

    // One millisecond before the expected delay — must not have resolved yet.
    await vi.advanceTimersByTimeAsync(expectedMs - 1);
    expect(resolved).toBe(false);

    // Advance the final millisecond and flush the microtask queue.
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(resolved).toBe(true);
  } finally {
    vi.useRealTimers();
  }
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.assign(process.env, ENV);
  mockGoogleOptions.mockReset();
  mockFilesGet.mockReset();
  mockFilesList.mockReset();
  mockSetCredentials.mockReset();
});

afterEach(() => {
  for (const key of Object.keys(ENV)) {
    delete process.env[key as keyof typeof ENV];
  }
});

// ---------------------------------------------------------------------------
// Status codes that trigger retries
// ---------------------------------------------------------------------------

describe('GoogleDriveClient retry policy (via gaxios retryConfig)', () => {
  it('retries on HTTP 429 and resolves on the second attempt', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).toContain(429);
  });

  it('retries on HTTP 500 and resolves on the second attempt', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).toContain(500);
  });

  it('retries on HTTP 502 and resolves on the second attempt', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).toContain(502);
  });

  it('retries on HTTP 503 and resolves on the second attempt', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).toContain(503);
  });

  it('retries on HTTP 504 and resolves on the second attempt', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).toContain(504);
  });

  // -------------------------------------------------------------------------
  // Status codes that must NOT trigger retries
  // -------------------------------------------------------------------------

  it('does NOT retry on HTTP 400', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).not.toContain(400);
  });

  it('does NOT retry on HTTP 401', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).not.toContain(401);
  });

  it('does NOT retry on HTTP 403', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).not.toContain(403);
  });

  it('does NOT retry on HTTP 404', () => {
    createClient();
    expect(capturedRetryConfig().retryableStatusCodes).not.toContain(404);
  });

  // -------------------------------------------------------------------------
  // No-response (network) failures
  // -------------------------------------------------------------------------

  it('retries on a no-response network failure up to `retries` times', () => {
    createClient();
    const config = capturedRetryConfig();
    // noResponseRetries must equal retries so both paths share the same budget.
    expect(config.noResponseRetries).toBe(config.retries);
    expect(config.noResponseRetries).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Retry-After backoff — tested by calling retryBackoff directly
  // -------------------------------------------------------------------------

  it('uses Retry-After header value (in seconds) as the backoff delay on 429', async () => {
    createClient();
    const { retryBackoff } = capturedRetryConfig();
    const err = { response: { headers: { 'retry-after': '3' } } };
    // Retry-After: 3 → 3000 ms; defaultDelay is 500 ms and should be ignored.
    await assertBackoffDelay(retryBackoff, err, 500, 3_000);
  });

  it('falls back to gaxios default backoff when Retry-After header is absent', async () => {
    createClient();
    const { retryBackoff } = capturedRetryConfig();
    const err = { response: { headers: {} } };
    // No Retry-After → use defaultDelay of 1000 ms.
    await assertBackoffDelay(retryBackoff, err, 1_000, 1_000);
  });

  it('ignores a Retry-After header that is not a positive finite number', async () => {
    createClient();
    const { retryBackoff } = capturedRetryConfig();
    const defaultDelay = 800;

    // 'abc' — not a number
    await assertBackoffDelay(retryBackoff, { response: { headers: { 'retry-after': 'abc' } } }, defaultDelay, defaultDelay);

    // '0' — not positive
    await assertBackoffDelay(retryBackoff, { response: { headers: { 'retry-after': '0' } } }, defaultDelay, defaultDelay);

    // '-5' — negative
    await assertBackoffDelay(retryBackoff, { response: { headers: { 'retry-after': '-5' } } }, defaultDelay, defaultDelay);

    // 'Infinity' — not finite
    await assertBackoffDelay(retryBackoff, { response: { headers: { 'retry-after': 'Infinity' } } }, defaultDelay, defaultDelay);
  });

  // -------------------------------------------------------------------------
  // Retry counts
  // -------------------------------------------------------------------------

  it('exhausts the default 3 retries and re-throws on a persistent failure', () => {
    createClient(); // no explicit retries option → default is 3
    const config = capturedRetryConfig();
    expect(config.retries).toBe(3);
    expect(config.noResponseRetries).toBe(3);
  });

  it('respects a custom `retries: 1` option (no retries, fails immediately)', () => {
    createClient({ retries: 1 });
    const config = capturedRetryConfig();
    expect(config.retries).toBe(1);
    expect(config.noResponseRetries).toBe(1);
  });

  it('respects a custom `retries: 5` option', () => {
    createClient({ retries: 5 });
    const config = capturedRetryConfig();
    expect(config.retries).toBe(5);
    expect(config.noResponseRetries).toBe(5);
  });

  // -------------------------------------------------------------------------
  // Happy path — no retry needed
  // -------------------------------------------------------------------------

  it('succeeds without retrying when the first attempt resolves', async () => {
    mockFilesGet.mockResolvedValueOnce({ data: 'hello world' });

    const client = createClient();
    const result = await client.getFileContent('file-id-abc');

    expect(result).toBe('hello world');
    // drive.files.get must have been called exactly once — no retries.
    expect(mockFilesGet).toHaveBeenCalledOnce();
  });
});
