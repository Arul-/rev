# Rev Agent Instructions

This repository is for building Rev, a second-opinion harness for Codex
`/goal`.

## Goal Discipline

When working on a `/goal` in this repo:

1. Treat `SPEC.md` as the source of truth.
2. Read `wiki/README.md` and the relevant wiki pages before changing behavior.
3. Keep the implementation small and demoable.
4. Prefer a working CLI over a broad architecture.
5. Do not mark the goal complete until Rev can run against its own repo.

## Required Completion Check

Before saying a goal is complete, run:

```bash
./bin/rev check
```

If `./bin/rev check` does not exist yet, building it is part of the goal.

The check should produce:
- `.rev/report.md`
- `.rev/test-output.txt`
- `.rev/diff.patch`
- `.rev/recovery-prompt.md` when the review fails or is inconclusive

## Reviewer Rule

Rev is not successful just because tests pass.

A Rev report must answer:
- Did the implementation satisfy the original goal?
- Did it drift from the goal?
- What changed?
- Were tests/checks run?
- What risks remain?
- What prompt should resume the work if the goal is not done?

## Implementation Bias

Use Bun for the CLI and tests. Keep dependencies minimal.

The first useful version can call existing shell commands:
- `git diff`
- configured test command
- `codex review --uncommitted`

Preferred structure:

```text
bin/rev
src/check.ts
src/config.ts
src/git.ts
src/tests.ts
src/reviewer.ts
src/report.ts
test/check.test.ts
```

Do not build a server, hosted UI, MCP server, or mobile app for the first
hackathon slice.

## Wiki Rule

Keep `wiki/` current.

Update it when:
- CLI behavior changes
- report format changes
- tests reveal an edge case
- Codex `/goal` usage reveals a limitation
- hackathon positioning changes

Do not paste large logs. Summarize the learning and include commands or file
paths.
