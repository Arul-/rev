# Rev Spec

## One-Liner

Rev adds a second-opinion reviewer to Codex `/goal`, so autonomous runs come
back with a trust report instead of just a diff.

## Target Track

Ralph Loop Hackathon: Harness / Skills Track.

Rev is a harness and skill pattern:
- harness design: wrap goal completion with review
- skill/spec writing: preserve the original goal as review input
- delegation craft: builder agent creates, reviewer agent critiques

## Problem

Codex `/goal` can run autonomously, but autonomy creates a trust gap.

When the user comes back, they need to know:
- whether the goal was actually completed
- whether the agent drifted
- whether tests were run
- whether risky files changed
- what to do next if the run is incomplete

Manual review is slow and easy to skip during a hackathon.

## Product

Rev is a Bun CLI that runs at the end of a goal and writes a review packet.

Inputs:
- `.rev/goal.md`
- current git diff
- test command output
- optional extra logs

Outputs:
- `.rev/diff.patch`
- `.rev/test-output.txt`
- `.rev/report.md`
- `.rev/recovery-prompt.md`

## MVP

Build `./bin/rev check`.

Behavior:

1. Ensure `.rev/` exists.
2. If `.rev/goal.md` does not exist, create it from the first positional
   argument or a template and tell the user to fill it.
3. Validate that Rev is running inside a Git repository.
4. Capture working-tree evidence:
   - `git status --short --untracked-files=all` into `.rev/status.txt`
   - staged diff into `.rev/staged.diff.patch`
   - unstaged diff into `.rev/unstaged.diff.patch`
   - combined diff into `.rev/diff.patch`
   - list of untracked text files into `.rev/untracked-files.txt`
5. Run a test command.
   - Read from `.rev/config.json` key `testCommand`.
   - If absent, try common commands in order:
     - `bun test`
     - `npm test`
     - `pnpm test`
   - If no package file exists, record that tests were skipped.
6. Run deterministic validators.
7. Run a reviewer command.
   - Default: `codex exec`.
   - It should run read-only.
   - Include goal, git status, diff, untracked-file summary, test output, and
     validator output in the prompt.
   - Ask for a compact JSON verdict first, then Markdown explanation.
8. Write `.rev/review.json` when a JSON verdict can be parsed.
9. Write `.rev/report.md`.
10. If the reviewer says the goal is not satisfied or the review is
   inconclusive, write `.rev/recovery-prompt.md`.

## Milestones

Build in this order.

### Milestone 1: CLI Skeleton

- `./bin/rev check` runs.
- It creates `.rev/` if missing.
- It reads `.rev/goal.md`.
- It exits with a clear error if the goal is missing.

### Milestone 2: Evidence Capture

- Captures git status and diffs into `.rev/`.
- Captures untracked text-file names.
- Excludes `.rev/` artifacts from review evidence.

### Milestone 3: Test Runner

- Runs the configured test command.
- Captures stdout, stderr, command, and exit code to `.rev/test-output.txt`.
- Does not crash when no test command is available.

### Milestone 4: Deterministic Validators

- Produces `.rev/validators.json`.
- Validator results are independent of the LLM reviewer.

### Milestone 5: Reviewer

- Builds a reviewer prompt from goal, evidence, tests, and validators.
- Runs configured reviewer command.
- Writes `.rev/report.md` and `.rev/review.json`.

### Milestone 6: Recovery

- Detects `goal_satisfied: false` or `verdict: inconclusive`.
- Writes `.rev/recovery-prompt.md`.

### Milestone 7: Tests

- Adds Bun tests for config, goal loading, diff capture, test output writing,
  validator output, report writing, and recovery prompt writing.
- `bun test` passes.

### Milestone 8: Dogfood

- Runs `./bin/rev check` on this repo.
- Inspects `.rev/report.md`.
- If Rev says incomplete or inconclusive, continue using
  `.rev/recovery-prompt.md`.

## Validators

Rev should not rely only on the reviewer model. Add deterministic validators
that produce `.rev/validators.json`:

```json
{
  "ok": false,
  "checks": [
    {
      "name": "goal_present",
      "status": "pass",
      "message": ".rev/goal.md exists and is non-empty"
    }
  ]
}
```

Required validators:
- `goal_present`: `.rev/goal.md` exists and is non-empty.
- `inside_git_repo`: `git rev-parse --show-toplevel` succeeds.
- `working_tree_has_reviewable_changes`: status/diff/untracked files contain
  reviewable work, unless the goal explicitly says no code change is expected.
- `tests_completed`: test command ran, failed, or was explicitly skipped with a
  reason.
- `rev_artifacts_excluded`: generated `.rev/` report artifacts are not included
  as review evidence.
- `report_written`: `.rev/report.md` is written.

Validator status values:
- `pass`
- `fail`
- `warn`
- `skip`

Rev can still produce a report when validators fail, but the report must show
the failed validators prominently.

## CLI

```bash
./bin/rev init
./bin/rev check
./bin/rev report
```

MVP only requires `check`.

## Config

`.rev/config.json`:

```json
{
  "testCommand": "bun test",
  "reviewCommand": "codex exec -s read-only",
  "reviewMode": "goal",
  "maxReviewBytes": 200000
}
```

If config is missing, use sensible defaults.

## Report Format

`.rev/report.md` should contain:

```md
# Rev Report

## Verdict

Goal satisfied: yes/no/inconclusive

## Evidence

- Goal:
- Diff:
- Tests:

## Drift

## Risks

## Missing Tests

## Recovery Prompt
```

`.rev/review.json` should use this shape:

```json
{
  "verdict": "approve",
  "goal_satisfied": true,
  "summary": "The implementation satisfies the goal.",
  "findings": [
    {
      "severity": "medium",
      "title": "Missing test for failing reviewer command",
      "body": "The CLI handles successful reviewer output but does not test non-zero reviewer exit.",
      "file": "src/reviewer.ts",
      "line_start": 42,
      "line_end": 57,
      "confidence": 0.8,
      "recommendation": "Add a Bun test that simulates reviewer command failure."
    }
  ],
  "next_steps": [
    "Add reviewer failure test"
  ],
  "recovery_prompt": "Continue the Rev goal by adding reviewer failure handling tests."
}
```

Allowed verdicts:
- `approve`
- `needs_attention`
- `inconclusive`

Finding severities:
- `critical`
- `high`
- `medium`
- `low`

If parsing structured JSON fails, Rev should still write the raw reviewer output
to `.rev/report.md` and mark the verdict as `inconclusive`.

## Reviewer Modes

Rev has three conceptual modes. MVP only needs `goal`.

- `goal`: Did the implementation satisfy `.rev/goal.md`?
- `adversarial`: Was the implementation approach/design a good idea?
- `rescue`: If failed, what prompt should continue the work?

This mirrors the useful split in OpenAI's Codex Claude Code plugin:
- `/codex:review` is read-only implementation review.
- `/codex:adversarial-review` challenges design assumptions.
- `/codex:rescue` delegates a fix/investigation.
- its optional review gate runs on stop and can block completion.

Rev's MVP should be less ambitious:
- always write evidence
- always write a report
- block only by convention through `AGENTS.md`
- avoid autonomous fix loops during the hackathon

## Non-Goals

Do not build:
- mobile UI
- hosted app
- MCP server
- multi-agent chat UI
- generic task manager

Those belong to Portel later. Rev is the small wedge.

## Demo Acceptance Criteria

The demo passes if:
- a user can write a goal into `.rev/goal.md`
- Codex can make a code change
- `./bin/rev check` runs
- `bun test` passes
- `.rev/report.md` is produced
- the report clearly says whether the change satisfies the goal
- the report includes a recovery prompt when it does not

## Build Stack

Use Bun.

Expected structure:

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

Use Bun and standard library APIs. Avoid runtime dependencies for the first
version. `@types/bun` is allowed for editor/type support.
