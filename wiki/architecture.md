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
