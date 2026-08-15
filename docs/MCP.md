# Career-Ops MCP server

This fork exposes the deterministic Career-Ops data and canonical writers as a native Model Context Protocol (MCP) server.

The MCP layer is intentionally thin: the model performs reasoning, while Career-Ops remains responsible for scanning, tracker state, validation, locking, and persistence.

## Requirements

- Node.js 20 or newer for the MCP server
- Existing Career-Ops setup (`config/profile.yml`, `portals.yml`, `data/`, etc.)

The main Career-Ops project keeps its existing Node.js requirement. MCP dependencies are isolated under `mcp/` so adding MCP does not force the rest of the repository onto the MCP SDK runtime requirement.

## Install and run over stdio

From the repository root:

```bash
npm install
npm run mcp:install
npm run mcp
```

The MCP server writes protocol frames to stdout. Diagnostic/fatal messages go to stderr.

## Tools

### Read-only

- `career_get_profile` — `config/profile.yml`
- `career_get_cv` — `cv.md`
- `career_get_pipeline` — `data/pipeline.md`
- `career_get_applications` — `data/applications.md`
- `career_get_portals` — `portals.yml`
- `career_list_reports` — list recent Markdown evaluation reports
- `career_doctor` — run the canonical `doctor.mjs`

Large Markdown files are bounded before being returned to the MCP client. Pipeline and application reads keep the newest tail when truncation is required.

### Mutating / active

- `career_scan` — invokes the canonical `scan.mjs`
  - defaults to `--dry-run`
  - set `write=true` to let Career-Ops update pipeline/history files
  - supports company filtering, verification, date bounds and blacklist controls
- `career_set_status` — invokes the canonical `set-status.mjs --json`
  - accepts exactly one selector: tracker row, report number, or company
  - state validation, ambiguity checks, tracker locking and atomic writes remain owned by `set-status.mjs`

## Security boundary

The MCP server does **not** expose a generic shell or arbitrary command runner.

`mcp/lib/runner.mjs` has an explicit allowlist of executable Career-Ops scripts and uses `child_process.spawn()` with `shell: false`. Tool arguments are passed as argument-vector entries rather than interpolated shell strings.

At the moment the allowlist contains only:

```text
scan.mjs
set-status.mjs
doctor.mjs
```

Add future MCP operations by exposing a dedicated tool and explicitly adding its canonical Career-Ops script to the allowlist.

## OpenAI Secure MCP Tunnel

When `tunnel-client` runs directly on a machine that already has Node.js and this checkout, point its stdio command at:

```bash
node /absolute/path/to/career-ops/mcp/server.mjs
```

For Docker, this fork includes a combined image because an stdio MCP process must be spawned by `tunnel-client` in the same container/runtime. The stock tunnel image does not need to bridge Docker stdin to another container.

Create `.env` in the repository root:

```dotenv
CONTROL_PLANE_API_KEY=sk-...
CONTROL_PLANE_TUNNEL_ID=tunnel_...
```

Then run:

```bash
docker compose -f docker-compose.mcp.yml up -d --build
docker compose -f docker-compose.mcp.yml logs -f career-ops-mcp
```

The compose stack persists writable Career-Ops state through `./data`. Profile, CV and portal configuration are mounted read-only. The tunnel health/admin listener is bound to `127.0.0.1:8080` on the Docker host.

## Notes about Playwright verification in Docker

The combined tunnel image installs the root JavaScript dependencies with lifecycle scripts disabled, so it does not download a Playwright browser during image build. Normal HTTP/API scanning works without it.

If `career_scan` is called with `verify=true`, build a variant that installs the Playwright Chromium runtime, or run the MCP server on a host where Career-Ops already has its browser dependencies installed.

## Architecture

```text
ChatGPT / MCP client
        |
        | MCP via OpenAI Secure Tunnel
        v
  tunnel-client
        |
        | stdio
        v
 mcp/server.mjs
        |
        +--> scan.mjs
        +--> set-status.mjs
        +--> doctor.mjs
        |
        +--> config/profile.yml
        +--> cv.md
        +--> data/pipeline.md
        +--> data/applications.md
        +--> reports/
```

This keeps LLM reasoning outside Career-Ops and turns the repository into a deterministic tool/data backend rather than nesting another model invocation behind MCP.
