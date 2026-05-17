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
