import assert from 'node:assert/strict';
import test from 'node:test';

import { readCareerFile, readReport } from '../lib/files.mjs';
import { runCareerScript } from '../lib/runner.mjs';

test('runner rejects scripts outside the MCP allowlist', () => {
  assert.throws(
    () => runCareerScript('sh', ['-c', 'id']),
    /not exposed through MCP/,
  );
});

test('runner rejects non-string argv entries', () => {
  assert.throws(
    () => runCareerScript('doctor.mjs', [{ command: 'id' }]),
    /array of strings/,
  );
});

test('report reader rejects path traversal', () => {
  assert.throws(
    () => readReport('../cv.md'),
    /single \.md filename/,
  );
});

test('report reader rejects non-markdown files', () => {
  assert.throws(
    () => readReport('profile.yml'),
    /single \.md filename/,
  );
});

test('canonical file reader does not accept arbitrary paths', () => {
  assert.throws(
    () => readCareerFile('../../etc/passwd'),
    /Unknown career-ops file/,
  );
});
