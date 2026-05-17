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
verdict, goal hash, summary, finding count, failed validators, test exit code,
and paths to the report/recovery prompt.

Future checks should include the last configured memory entries in the reviewer
prompt. This helps Codex notice repeated failure loops without re-reading full
logs or full diffs.

## Future Inspector

`claude-mem` runs a local web inspector for human memory browsing. Rev should
not build that in the first MVP, but the natural later command is:

```bash
./bin/rev serve
```

It would show previous `rev check` runs, verdicts, validator failures, repeated
findings, report links, and recovery prompts from `.rev/memory.jsonl`.
