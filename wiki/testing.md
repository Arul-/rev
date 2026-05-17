# Rev Testing

Rev should be tested at two levels:

1. Unit tests with `bun test`.
2. Dogfood tests where Rev reviews changes to Rev itself.

## Unit Test Targets

Test:
- missing `.rev/goal.md`
- config defaults
- diff capture
- test command success
- test command failure
- validator JSON
- structured review JSON parsing
- fallback when structured parsing fails
- report writing
- recovery prompt writing
- memory JSONL append
- recent memory inclusion in reviewer prompt
- Codex-interpreted goal stored in memory and review JSON
- decision paths are written, searchable, and copyable as Markdown
- untracked text files are included in `.rev/diff.patch` so the reviewer can
  inspect newly created implementation files before they are staged
- `rev serve` exposes both the inspector HTML and `/api/state` artifact payload
  in a smoke test
- `.rev/` exclusion validation distinguishes generated artifact file paths from
  ordinary code or documentation text that mentions `.rev/report.md`

## Dogfood Scenarios

### No Changes

Run from a clean tree:

```bash
./bin/rev check
```

Expected:
- report exists
- report says there is no diff or insufficient evidence

### Bad Change

Make a change that obviously does not satisfy `.rev/goal.md`.

Expected:
- report flags mismatch
- recovery prompt exists

### Failing Tests

Introduce a failing test.

Expected:
- `.rev/test-output.txt` captures failure
- report marks risk
- recovery prompt exists

### Good Change

Implement the requested behavior and run:

```bash
bun test
./bin/rev check
```

Expected:
- `.rev/diff.patch` exists
- `.rev/test-output.txt` exists
- `.rev/report.md` exists
- report explains why the goal is satisfied or what remains

### Repeated Incomplete Run

Run `./bin/rev check` twice after an intentionally incomplete implementation.

Expected:
- `.rev/memory.jsonl` has one line per run
- each memory entry includes `goal_interpretation`
- the second reviewer prompt includes the first run's compact memory entry
- report notices repeated unresolved findings when relevant

### Dashboard Demo

Run:

```bash
./bin/rev serve
```

Expected:
- prints a localhost URL
- page loads before any review exists
- page updates after `./bin/rev check`
- goal, interpreted goal, verdict, drift warnings, validators, tests, recovery
  prompt, run history, and decision paths are visible without opening raw files

### Decision Path Search

Run:

```bash
./bin/rev search drift
```

Expected:
- searches `.rev/decisions.jsonl`
- returns matching decision paths
- includes copyable Markdown for each match
