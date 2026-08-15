import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MCP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CAREER_OPS_ROOT = resolve(MCP_DIR, '..');

const ALLOWED_SCRIPTS = new Set([
  'scan.mjs',
  'set-status.mjs',
  'doctor.mjs',
]);

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_BYTES = 2 * 1024 * 1024;

function appendBounded(current, chunk) {
  if (current.length >= MAX_CAPTURE_BYTES) return current;
  const remaining = MAX_CAPTURE_BYTES - current.length;
  return current + chunk.toString('utf8').slice(0, remaining);
}

export function runCareerScript(script, args = [], { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!ALLOWED_SCRIPTS.has(script)) {
    throw new Error(`Script is not exposed through MCP: ${script}`);
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new TypeError('MCP runner arguments must be an array of strings');
  }

  const scriptPath = resolve(CAREER_OPS_ROOT, script);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: CAREER_OPS_ROOT,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    child.stdout.on('data', (chunk) => { stdout = appendBounded(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = appendBounded(stderr, chunk); });
    child.once('error', reject);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    timer.unref?.();

    child.once('close', (exitCode, signal) => {
      clearTimeout(timer);
      resolvePromise({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        signal,
        timedOut,
        stdout,
        stderr,
        truncated: stdout.length >= MAX_CAPTURE_BYTES || stderr.length >= MAX_CAPTURE_BYTES,
      });
    });
  });
}
