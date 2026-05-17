# Claude Mem Research

Researched locally from the installed Claude Code plugin:

```text
/Users/arul/.claude/plugins/cache/thedotmack/claude-mem/9.1.1
```

## What It Is

`claude-mem` is a persistent memory system for Claude Code. It captures useful
session observations, summarizes completed work, stores them locally, and makes
them searchable from future Claude sessions.

It is not just a hook script. It is a small local memory platform.

## Installed Stack

Observed files:

- `hooks/hooks.json`
- `.mcp.json`
- `scripts/worker-service.cjs`
- `scripts/mcp-server.cjs`
- `skills/mem-search/SKILL.md`
- `ui/viewer.html`
- `ui/viewer-bundle.js`
- `.claude-plugin/plugin.json`

Runtime defaults observed in bundled scripts:

- data dir: `~/.claude-mem`
- SQLite DB: `~/.claude-mem/claude-mem.db`
- vector DB dir: `~/.claude-mem/vector-db`
- worker host: `127.0.0.1`
- worker port: `37777`
- web/API surface: `http://127.0.0.1:37777`

## Web Inspector

`claude-mem` also ships a browser inspector. The installed plugin includes:

```text
ui/viewer.html
ui/viewer-bundle.js
```

The same worker process that serves MCP-backed APIs also exposes HTTP routes
for health, search, timeline, observations, logs, settings, and the viewer UI.
The result is a local dashboard for inspecting memory outside the Claude Code
chat window.

That matters for product design. The memory system has three access paths:

- hooks write observations automatically
- MCP tools let Claude search and save memory
- a local web UI lets the human inspect and debug the memory store

For Rev, this suggests a later `rev inspect` or `rev serve` command could be
useful after the CLI proves itself. It should show prior runs, verdicts,
repeated findings, validator failures, reports, and recovery prompts. This is a
post-MVP feature, not part of the first `/goal` build.

## Hook Flow

`hooks/hooks.json` wires Claude Code lifecycle events to a worker service:

- `Setup`: run plugin setup
- `SessionStart`: install/start worker, inject context
- `UserPromptSubmit`: start worker and initialize session tracking
- `PostToolUse`: capture observations after tool use
- `Stop`: summarize and mark session complete

The hook command shape is:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/bun-runner.js" \
  "${CLAUDE_PLUGIN_ROOT}/scripts/worker-service.cjs" hook claude-code <event>
```

This means Claude Code stays responsive while the worker owns storage,
summarization, retries, and search.

## Storage Model

Bundled code shows these concepts:

- sessions
- observations
- user prompts
- session summaries
- pending messages
- Chroma/vector sync

The plugin also writes human-readable project memory files under Claude's
project directory, for example:

```text
~/.claude/projects/<project-slug>/memory/*.md
```

Those files use YAML frontmatter plus Markdown:

```md
---
name: short memory name
description: one-line description
type: project
originSessionId: ...
---
Body with why/how-to-apply notes.
```

The important product idea is that memory is both machine-searchable and
human-auditable.

## MCP Search

`.mcp.json` registers a stdio MCP server:

```json
{
  "mcpServers": {
    "mcp-search": {
      "type": "stdio",
      "command": "${CLAUDE_PLUGIN_ROOT}/scripts/mcp-server.cjs"
    }
  }
}
```

The MCP server exposes tools including:

- `search`
- `timeline`
- `get_observations`
- `save_memory`
- `__IMPORTANT`

The `mem-search` skill requires a three-step workflow:

1. Search for compact result rows.
2. Use timeline around promising hits.
3. Fetch full observations only for selected IDs.

That is the core token-saving pattern.

## What Rev Should Copy

Copy the workflow idea:

- summarize outcomes
- keep durable local memory
- inject compact recent context into the next agent run
- keep raw evidence separately and link to it
- make memory inspectable

For Rev MVP, implement this as `.rev/memory.jsonl`.

Each `rev check` should append:

- timestamp
- goal hash
- Codex's clear interpretation of what the user asked
- verdict
- goal satisfaction boolean
- compact summary
- finding count
- failed validator names
- test exit code
- report path
- recovery prompt path

The next check can include the last configured entries in the reviewer prompt.

The interpreted goal is the main value copied from `claude-mem`'s compression
idea. The raw user request can be indirect or noisy; the stored memory should
preserve Codex's concise reading of the implementation intent.

## What Rev Should Not Copy Yet

Do not copy these into the hackathon MVP:

- background worker daemon
- SQLite schema
- vector DB / Chroma
- web UI / inspector server
- MCP server
- automatic Claude hook integration

Those are useful for a mature product, but they distract from the hackathon
goal: prove that Codex `/goal` benefits from a second-opinion trust loop.

## Codex Angle

For Codex, Rev can work without hooks because `/goal` can explicitly run:

```bash
./bin/rev check
```

Later, if Codex hook support is stable enough for this workflow, Rev can add a
hook integration that runs `rev check` after a goal-like session completes.
Until then, explicit CLI invocation is more reliable and easier to demo.

## Privacy Rule

Memory is not a transcript.

Rev should not store raw prompts, raw diffs, or full reviewer output in
`.rev/memory.jsonl`. It should store compact outcomes and paths to artifacts.
If text contains `<private>...</private>`, exclude that block from memory
summaries.
