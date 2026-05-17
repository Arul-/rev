# Rev

Rev is an automatic second-opinion hook for Codex `/goal`.

Codex builds. Rev checks whether the goal is actually done.

## Hackathon Scope

Build a small CLI that can run at the end of a Codex `/goal` session and produce
a trust report.

The first version should:
- read the goal/spec from `.rev/goal.md`
- capture the current `git diff`
- run the configured test command, if present
- run a reviewer command against the goal, diff, and test output
- write `.rev/report.md`
- write `.rev/recovery-prompt.md` when the reviewer says the goal is not done

Do not build the full Portel/Tel product here. This repo is only the Rev
hackathon harness.

## Demo Story

During the Ralph Loop, Codex can work autonomously for an hour. Rev gives the
human a second opinion before accepting the result.

```text
/goal Build feature X
Codex edits code
Rev runs automatically at the end
Rev reviews goal + diff + tests
Human comes back to a trust report
```

## Intended Commands

```bash
rev init
rev check
rev report
```

For the first implementation, `rev check` is enough.

## Reviewer Backends

Start with Codex because it is available at the event:

```bash
codex review --uncommitted "Rev review: compare the current diff against .rev/goal.md and .rev/test-output.txt. Report: goal_satisfied yes/no, drift, risky changes, missing tests, and a recovery prompt if not satisfied."
```

Optional later backends:
- `claude`
- `gemini`
- custom command configured in `.rev/config.json`

## Hook Shape

Codex hook support may vary by environment. For the hackathon, Rev should work
even without a native hook:

1. Codex `/goal` follows `AGENTS.md`.
2. Before final completion, Codex runs `rev check`.
3. If native Codex hooks are available, wire the stop/finish hook to `rev check`.

The product idea is the same either way: autonomous work ends with a trust
report, not just a diff.
