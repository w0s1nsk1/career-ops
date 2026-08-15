#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/server';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';

import { listReports, readCareerFile, readReport } from './lib/files.mjs';
import { runCareerScript } from './lib/runner.mjs';

const server = new McpServer({
  name: 'career-ops',
  version: '0.1.0',
});

function textResult(text, extra = {}) {
  return {
    content: [{ type: 'text', text }],
    ...extra,
  };
}

function errorResult(message, details = '') {
  return {
    isError: true,
    content: [{
      type: 'text',
      text: details ? `${message}\n\n${details}` : message,
    }],
  };
}

function fileTool(name, description, { tail = false } = {}) {
  server.registerTool(
    `career_get_${name}`,
    {
      description,
      inputSchema: z.object({
        max_chars: z.number().int().min(1_000).max(500_000).optional(),
      }),
    },
    async ({ max_chars }) => {
      const result = readCareerFile(name, { maxChars: max_chars, tail });
      if (!result.exists) return errorResult(`${result.path} does not exist yet.`);
      const suffix = result.truncated
        ? `\n\n[MCP truncated ${result.path} to ${result.text.length}/${result.totalChars} characters.]`
        : '';
      return textResult(result.text + suffix);
    },
  );
}

fileTool('profile', 'Read the canonical Career-Ops candidate profile from config/profile.yml.');
fileTool('cv', 'Read the canonical Career-Ops CV markdown.');
fileTool('pipeline', 'Read the job discovery/evaluation pipeline. Returns the newest tail when truncation is needed.', { tail: true });
fileTool('applications', 'Read the canonical application tracker. Returns the newest tail when truncation is needed.', { tail: true });
fileTool('portals', 'Read the configured job portals and tracked companies from portals.yml.');

server.registerTool(
  'career_list_reports',
  {
    description: 'List the most recently modified Career-Ops evaluation reports.',
    inputSchema: z.object({
      limit: z.number().int().min(1).max(200).optional(),
    }),
  },
  async ({ limit }) => textResult(JSON.stringify(listReports({ limit }), null, 2)),
);

server.registerTool(
  'career_get_report',
  {
    description: 'Read one Markdown evaluation report returned by career_list_reports.',
    inputSchema: z.object({
      name: z.string().min(1),
      max_chars: z.number().int().min(1_000).max(500_000).optional(),
    }),
  },
  async ({ name, max_chars }) => {
    try {
      const result = readReport(name, { maxChars: max_chars });
      if (!result.exists) return errorResult(`${result.path} does not exist.`);
      const suffix = result.truncated
        ? `\n\n[MCP truncated ${result.path} to ${result.text.length}/${result.totalChars} characters.]`
        : '';
      return textResult(result.text + suffix);
    } catch (error) {
      return errorResult(error.message);
    }
  },
);

server.registerTool(
  'career_scan',
  {
    description: 'Run the deterministic Career-Ops job scanner. By default this is a dry-run; set write=true to let scan.mjs update its canonical pipeline/history files.',
    inputSchema: z.object({
      company: z.string().min(1).optional(),
      verify: z.boolean().optional(),
      since_days: z.number().int().min(0).max(3650).optional(),
      posted_after: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      posted_before: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      include_blacklisted: z.boolean().optional(),
      rediscover_404: z.boolean().optional(),
      write: z.boolean().optional(),
      timeout_ms: z.number().int().min(1_000).max(900_000).optional(),
    }),
  },
  async (input) => {
    const args = ['--quiet'];
    if (!input.write) args.push('--dry-run');
    if (input.company) args.push('--company', input.company);
    if (input.verify || input.rediscover_404) args.push('--verify');
    if (input.since_days !== undefined) args.push('--since', String(input.since_days));
    if (input.posted_after) args.push('--posted-after', input.posted_after);
    if (input.posted_before) args.push('--posted-before', input.posted_before);
    if (input.include_blacklisted) args.push('--include-blacklisted');
    if (input.rediscover_404) args.push('--rediscover-404');

    const result = await runCareerScript('scan.mjs', args, { timeoutMs: input.timeout_ms ?? 120_000 });
    const details = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
    if (!result.ok) {
      const why = result.timedOut ? 'Career-Ops scan timed out.' : `Career-Ops scan exited with code ${result.exitCode}.`;
      return errorResult(why, details);
    }
    return textResult(details || 'Career-Ops scan completed successfully.');
  },
);

server.registerTool(
  'career_set_status',
  {
    description: 'Update one application status through the canonical set-status.mjs writer. Exactly one selector must be supplied: row, report, or company.',
    inputSchema: z.object({
      row: z.number().int().positive().optional(),
      report: z.number().int().positive().optional(),
      company: z.string().min(1).optional(),
      state: z.string().min(1),
      role: z.string().min(1).optional(),
      note: z.string().min(1).optional(),
      on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      dry_run: z.boolean().optional(),
    }),
  },
  async (input) => {
    const selectors = [input.row !== undefined, input.report !== undefined, Boolean(input.company)].filter(Boolean).length;
    if (selectors !== 1) {
      return errorResult('Provide exactly one selector: row, report, or company.');
    }

    const args = [];
    if (input.row !== undefined) args.push('--row', String(input.row), input.state);
    else if (input.report !== undefined) args.push('--report', String(input.report), input.state);
    else args.push(input.company, input.state);

    if (input.role) args.push('--role', input.role);
    if (input.note) args.push('--note', input.note);
    if (input.on) args.push('--on', input.on);
    if (input.dry_run) args.push('--dry-run');
    args.push('--json');

    const result = await runCareerScript('set-status.mjs', args, { timeoutMs: 30_000 });
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
    if (!result.ok) return errorResult(`Status update failed with code ${result.exitCode}.`, output);
    return textResult(output || 'Application status updated.');
  },
);

server.registerTool(
  'career_doctor',
  {
    description: 'Run the Career-Ops diagnostic script and return its output.',
    inputSchema: z.object({}),
  },
  async () => {
    const result = await runCareerScript('doctor.mjs', [], { timeoutMs: 60_000 });
    const output = [result.stdout.trim(), result.stderr.trim()].filter(Boolean).join('\n\n');
    if (!result.ok) return errorResult(`Career-Ops doctor exited with code ${result.exitCode}.`, output);
    return textResult(output || 'Career-Ops doctor completed successfully.');
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('[career-ops-mcp] fatal:', error);
  process.exitCode = 1;
});
