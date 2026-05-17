# Rev

**Codex says "done." Rev checks whether the goal is actually done.**

Rev is a second-opinion CLI for autonomous Codex `/goal` runs. It compares the
original goal with the actual evidence in the repo: git diff, test output,
deterministic validators, recent run memory, and a reviewer verdict.

Agents can pass tests, write a confident final message, and still miss what the
user asked for. Rev is the checkpoint before you accept the run.

![Rev decision path demo](docs/assets/rev-decision-path.gif)

```text
Goal satisfied: yes/no
Drift: none/low/medium/high
Decision path: Intent -> Observation -> Decision -> Recovery
Recovery prompt: the exact prompt to continue if the run drifted
```

## Why Rev Exists

Autonomous coding changes the review question.

The old question was:

```text
Do the tests pass?
```

The new question is:

```text
Did the agent actually satisfy the user's goal?
```

Rev answers that second question. It creates a review packet, asks a
goal-aware reviewer for a verdict, stores a portable decision path, and writes a
recovery prompt when the run needs to continue.

## Quickstart

```bash
bun install
bun test
./bin/rev check "Build the smallest useful feature and verify it"
./bin/rev serve
```

`rev serve` prints a local inspector URL. By default it uses
`http://127.0.0.1:37887`; if that port is busy, Rev uses the next available
port.

For the prepared demo:

```bash
bun run demo
```

## How It Fits Codex `/goal`

Use Rev as the final gate for an autonomous run:

```text
1. Start Codex with /goal.
2. Codex changes the repo.
3. Run ./bin/rev check before accepting "done."
4. If Rev rejects the run, paste .rev/recovery-prompt.md back into Codex.
```

If your Codex environment supports finish/stop hooks, wire the hook to:

```bash
./bin/rev check
```

Rev does not require a hook to be useful. The CLI and inspector work today as a
manual final check.

## What `rev check` Does

`rev check`:

- reads the goal from `.rev/goal.md` or the command argument
- captures git status, staged diff, unstaged diff, combined diff, and
  untracked text-file names
- runs the configured test command
- runs deterministic validators before the reviewer
- sends goal, evidence, tests, validators, and recent memory to the reviewer
- writes `.rev/report.md`
- writes `.rev/recovery-prompt.md` when the goal is incomplete or inconclusive
- appends compact run memory to `.rev/memory.jsonl`
- appends portable decision paths to `.rev/decisions.jsonl`

## Commands

```bash
./bin/rev init
./bin/rev check ["goal"]
./bin/rev report
./bin/rev serve
./bin/rev search <query>
```

## Output Files

```text
.rev/status.txt
.rev/staged.diff.patch
.rev/unstaged.diff.patch
.rev/diff.patch
.rev/untracked-files.txt
.rev/test-output.txt
.rev/validators.json
.rev/reviewer-output.txt
.rev/review.json
.rev/report.md
.rev/recovery-prompt.md
.rev/memory.jsonl
.rev/decisions.jsonl
```

Generated Rev artifacts are ignored by git, so repeated runs do not pollute the
review diff.

## Reviewer Backends

Rev defaults to a goal-aware Codex reviewer:

```bash
codex exec -s read-only
```

You can configure a different reviewer command in `.rev/config.json`. For local
tests, Rev also supports a deterministic internal reviewer:

```json
{
  "reviewCommand": "internal"
}
```

## Inspector

`rev serve` starts a file-backed local dashboard over the latest `.rev/`
artifacts. It shows:

- original goal and reviewer interpretation
- goal match, drift, tests, and recovery status
- deterministic validator results
- latest report and recovery prompt
- run memory
- searchable decision paths

The main object is the decision path rail:

```text
Intent -> Observation -> Decision -> Recovery
```

That path is the useful artifact. It explains what the user asked for, what the
agent actually did, what Rev decided, and how to continue.

## Project Knowledge

The `wiki/` folder contains design notes, architecture decisions, and research
behind Rev. It is part of the project context for future agent runs.
