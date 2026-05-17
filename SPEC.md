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

Rev is a CLI that runs at the end of a goal and writes a review packet.

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
3. Capture `git diff -- . ':!.rev'` into `.rev/diff.patch`.
4. Run a test command.
   - Read from `.rev/config.json` key `testCommand`.
   - If absent, try common commands in order:
     - `npm test`
     - `bun test`
     - `pnpm test`
   - If no package file exists, record that tests were skipped.
5. Run a reviewer command.
   - Default: `codex review --uncommitted`.
   - Include goal, diff, and test output in the prompt.
6. Write `.rev/report.md`.
7. If the reviewer says the goal is not satisfied or the review is
   inconclusive, write `.rev/recovery-prompt.md`.

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
  "testCommand": "npm test",
  "reviewCommand": "codex review --uncommitted"
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
- `.rev/report.md` is produced
- the report clearly says whether the change satisfies the goal
- the report includes a recovery prompt when it does not
