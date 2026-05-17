# Rev Architecture

Rev is a local Bun CLI.

MVP command:

```bash
./bin/rev check
```

Internal flow:

```text
.rev/goal.md
  -> read goal
  -> capture git diff
  -> run tests
  -> run reviewer command
  -> write report
  -> write recovery prompt when needed
```

Core files expected:

```text
bin/rev
src/check.ts
src/config.ts
src/git.ts
src/tests.ts
src/reviewer.ts
src/report.ts
test/
```

Artifacts:

```text
.rev/diff.patch
.rev/staged.diff.patch
.rev/unstaged.diff.patch
.rev/status.txt
.rev/untracked-files.txt
.rev/test-output.txt
.rev/validators.json
.rev/review.json
.rev/report.md
.rev/recovery-prompt.md
.rev/memory.jsonl
.rev/decisions.jsonl
```

Rev should stay inspectable. The user should be able to open `.rev/` and see
exactly what Rev used as evidence.

## Validators

Rev runs deterministic validators before asking the reviewer model.

Required validators:
- goal exists
- command runs inside a Git repo
- reviewable changes exist or are explicitly not required
- tests ran, failed, or were explicitly skipped
- `.rev/` generated artifacts are excluded from evidence
- report was written

Validators write `.rev/validators.json` and are included in the reviewer prompt.

## Run Memory

Rev keeps lightweight continuity in `.rev/memory.jsonl`.

Unlike `claude-mem`, Rev does not need a daemon, SQLite, vector search, or MCP
tools for the hackathon MVP. Each `rev check` appends a compact outcome:
verdict, goal hash, Codex's interpreted goal, summary, finding count, failed
validators, test exit code, and paths to the report/recovery prompt.

Future checks should include the last configured memory entries in the reviewer
prompt. This helps Codex notice repeated failure loops without re-reading full
logs or full diffs.

The interpreted goal is important. Users often describe work in a conversational
or roundabout way; Rev should preserve Codex's clear implementation-level
reading of the request so the next reviewer can compare work against intent
without replaying the whole conversation.

## Future Inspector

`claude-mem` runs a local web inspector for human memory browsing. Rev should
not build that in the first MVP, but the natural later command is:

```bash
./bin/rev serve
```

It would show previous `rev check` runs, verdicts, validator failures, repeated
findings, report links, and recovery prompts from `.rev/memory.jsonl`.

## Decision Paths

Rev stores portable decision paths in `.rev/decisions.jsonl`.

Unlike `claude-mem`, which focuses on memories, Rev focuses on decision paths:
intent, observation, decision, evidence, and recovery. These copyable units can
move to another repo, Codex session, Claude session, or wiki. Examples:
- interpreted goal -> implementation target
- drift reason -> recovery prompt
- failed validator -> required fix
- hallucinated completion claim -> evidence disproving it

`rev search <query>` should search decision paths locally. MVP search can be
case-insensitive text search over JSONL.
