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
.rev/test-output.txt
.rev/report.md
.rev/recovery-prompt.md
```

Rev should stay inspectable. The user should be able to open `.rev/` and see
exactly what Rev used as evidence.
