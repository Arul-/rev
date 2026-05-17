# Goal

Build Rev as a Bun CLI using `SPEC.md`, `AGENTS.md`, and `wiki/`.

Rev is a second-opinion reviewer for Codex `/goal` that catches drift and
hallucination, then writes the recovery prompt to get the run back on track.

## Bootstrap Rule

Because Rev does not exist yet, first implement enough of `./bin/rev check` to
run locally.

The first successful bootstrap means:
- `bun test` passes
- `./bin/rev check` runs
- `.rev/report.md` is produced
- `./bin/rev serve` shows the latest Rev state in a browser

## Dogfood Rule

Once `./bin/rev check` exists, use Rev to review this repository before marking
the goal complete.

If `.rev/report.md` says the goal is not satisfied or inconclusive, continue
using `.rev/recovery-prompt.md`.

## Milestones

### Milestone 1: CLI Skeleton

- `./bin/rev check` runs.
- It creates `.rev/` if missing.
- It reads `.rev/goal.md`.
- It exits with a clear error if the goal is missing.

### Milestone 2: Evidence Capture

- Captures `git status --short --untracked-files=all` to `.rev/status.txt`.
- Captures staged diff to `.rev/staged.diff.patch`.
- Captures unstaged diff to `.rev/unstaged.diff.patch`.
- Captures combined review diff to `.rev/diff.patch`.
- Excludes generated `.rev/` artifacts from review evidence.

### Milestone 3: Test Runner

- Runs the configured test command.
- Writes command, stdout, stderr, and exit code to `.rev/test-output.txt`.
- Handles missing test command without crashing.

### Milestone 4: Validators

- Writes `.rev/validators.json`.
- Includes checks for goal presence, git repo, reviewable changes, tests, and
  report artifacts.

### Milestone 5: Reviewer

- Builds a reviewer prompt from goal, status, diff, tests, and validators.
- Runs the configured reviewer command.
- Writes `.rev/report.md`.
- Writes `.rev/review.json` if structured JSON can be parsed.

### Milestone 6: Recovery

- Detects `goal_satisfied: false`, `needs_attention`, or `inconclusive`.
- Writes `.rev/recovery-prompt.md`.

### Milestone 7: Tests

- Adds Bun tests for config, goal loading, evidence capture, test output,
  validators, report writing, and recovery prompt writing.
- `bun test` passes.

### Milestone 8: Dogfood

- Runs `./bin/rev check` on this repo.
- Inspects `.rev/report.md`.
- Continues if Rev reports incomplete or inconclusive.

### Milestone 9: Run Memory

- Appends compact run outcomes to `.rev/memory.jsonl`.
- Includes recent memory entries in future reviewer prompts.
- Stores Codex's concise interpretation of what the user actually asked.
- Does not store raw diffs, raw prompts, or text inside `<private>` blocks.

### Milestone 10: Always-On Inspector

- Adds `./bin/rev serve`.
- Serves a local dashboard over `.rev/` artifacts.
- Auto-refreshes while Codex is working.
- Shows goal, interpreted goal, verdict, drift/hallucination warnings,
  validators, tests, recovery prompt, run history, and decision paths.
- `./bin/rev check` should start or reuse the dashboard when possible, but
  report generation must still work if the dashboard cannot start.

### Milestone 11: Portable Decision Paths

- Extracts decision paths from reviews.
- Writes `.rev/decisions.jsonl`.
- Supports `./bin/rev search <query>` over decision paths.
- Shows decision paths in `./bin/rev serve`.
- Lets the user copy a decision path as Markdown for another repo, session, or
  wiki.
