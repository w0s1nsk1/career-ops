import { basename, join } from 'node:path';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { CAREER_OPS_ROOT } from './runner.mjs';

const FILES = Object.freeze({
  profile: 'config/profile.yml',
  cv: 'cv.md',
  pipeline: 'data/pipeline.md',
  applications: 'data/applications.md',
  portals: 'portals.yml',
});

function boundedText(fullText, { maxChars = 100_000, tail = false } = {}) {
  const limit = Math.max(1_000, Math.min(Number(maxChars) || 100_000, 500_000));
  const truncated = fullText.length > limit;
  const text = truncated
    ? (tail ? fullText.slice(-limit) : fullText.slice(0, limit))
    : fullText;
  return { text, truncated, totalChars: fullText.length };
}

export function readCareerFile(name, { maxChars = 100_000, tail = false } = {}) {
  const relativePath = FILES[name];
  if (!relativePath) throw new Error(`Unknown career-ops file: ${name}`);

  const absolutePath = join(CAREER_OPS_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { exists: false, path: relativePath, text: '' };
  }

  const fullText = readFileSync(absolutePath, 'utf8');
  return { exists: true, path: relativePath, ...boundedText(fullText, { maxChars, tail }) };
}

export function listReports({ limit = 50 } = {}) {
  const reportsDir = join(CAREER_OPS_ROOT, 'reports');
  if (!existsSync(reportsDir)) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));
  return readdirSync(reportsDir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const stats = statSync(join(reportsDir, name));
      return { name, size: stats.size, modifiedAt: stats.mtime.toISOString() };
    })
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, safeLimit);
}

export function readReport(name, { maxChars = 100_000 } = {}) {
  if (typeof name !== 'string' || !name.endsWith('.md') || basename(name) !== name) {
    throw new Error('Report name must be a single .md filename from career_list_reports.');
  }

  const relativePath = join('reports', name);
  const absolutePath = join(CAREER_OPS_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    return { exists: false, path: relativePath, text: '' };
  }

  const fullText = readFileSync(absolutePath, 'utf8');
  return { exists: true, path: relativePath, ...boundedText(fullText, { maxChars }) };
}
