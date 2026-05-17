# Rev Hackathon Notes

Event: Ralph Loop Hackathon

Target track: Harness / Skills Track.

One-liner:

> Codex builds. Rev checks whether the goal is actually done.

Longer pitch:

> Rev is an automatic second-opinion harness for Codex `/goal`. It turns
> autonomous coding from "come back and inspect the diff" into "come back to a
> trust report."

Judging fit:
- harness design: Rev wraps goal completion with review
- skills: `AGENTS.md` teaches Codex goal discipline
- spec writing: `.rev/goal.md` is preserved as source of truth
- delegation craft: builder agent changes code, reviewer agent critiques it

Demo flow:

```text
/goal Build feature X
Codex edits code
Rev runs ./bin/rev check
Rev captures goal + diff + tests
Reviewer produces .rev/report.md
Human sees verdict and recovery prompt
```

Do not over-explain Portel, Tel, Photon, or MCP in the demo. Rev is the small
visible wedge.
