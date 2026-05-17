# Rev Codex Hook

Rev ships with a project-local Codex Stop hook. Install it in any project with:

```bash
rev init
```

That creates:

```text
.rev/
.codex/hooks.json
.codex/hooks/rev-stop.mjs
```

Codex discovers project hooks from `.codex/hooks.json` when the repository is
trusted. Review and trust the hook once from inside Codex:

```text
/hooks
```

## What The Hook Does

When Codex is about to stop, the hook receives the latest assistant message. If
the message looks like completion, the hook runs:

```bash
rev check
```

Then it reads `.rev/review.json`:

- If `goal_satisfied` is `true` and the verdict is `approve`, Codex can stop.
- Otherwise, the hook blocks the stop and feeds Codex the recovery prompt from
  `.rev/recovery-prompt.md`.

That makes Rev an automatic goal-satisfaction gate, not just a report you need
to remember to run.

## Safety

The hook has a recursion guard. When Rev itself invokes a Codex reviewer, the
hook does not re-enter and review its own reviewer turn.

Hook execution logs are written to:

```text
.rev/hook-output.txt
```

Generated `.rev/` artifacts are ignored by git.
