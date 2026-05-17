# Research: Codex Review And Review Gates

Date: 2026-05-17

## Sources Read

- OpenAI Codex CLI non-interactive docs
- OpenAI `codex-plugin-cc` docs and repository
- Agent self-review loop pattern notes
- OpenAI "How OpenAI uses Codex" best-practices PDF

## Useful Prior Art

OpenAI's Codex plugin for Claude Code has four relevant pieces:

1. `/codex:review`
   - read-only review
   - supports working-tree or branch review
   - returns Codex output without applying fixes

2. `/codex:adversarial-review`
   - read-only
   - challenges design choices, assumptions, tradeoffs, and failure modes
   - accepts focus text

3. `/codex:rescue`
   - delegates a bug investigation or fix task to Codex
   - can run in background
   - can resume a previous Codex thread

4. Review gate
   - uses a `Stop` hook
   - runs a targeted Codex review before Claude stops
   - blocks completion if the review returns `BLOCK`
   - has a timeout because review loops can become expensive

## Design Lessons For Rev

### Keep Review Read-Only

Rev's default reviewer should not edit files.

Reason: Rev is a trust/report layer. Mixing review and mutation makes the demo
harder to reason about.

### Separate Goal Review From Adversarial Review

Goal review asks:

> Did this satisfy `.rev/goal.md`?

Adversarial review asks:

> Was this the right design?

MVP should implement goal review first. Adversarial mode can be a later flag.

### Add Deterministic Validators

An LLM reviewer alone is too soft.

Rev should first compute mechanical facts:
- goal exists
- repo is a Git repo
- reviewable changes exist
- tests ran or were explicitly skipped
- `.rev/` artifacts are excluded
- report was written

These facts feed the reviewer and also appear in the report.

### Use Structured Verdicts

OpenAI's plugin uses compact contracts like:

```text
ALLOW: reason
BLOCK: reason
```

For Rev, use JSON:

```json
{
  "verdict": "approve",
  "goal_satisfied": true,
  "summary": "...",
  "findings": [],
  "next_steps": [],
  "recovery_prompt": "..."
}
```

If JSON parsing fails, write the raw output and mark the verdict inconclusive.

### Do Not Auto-Fix In MVP

Self-review loops can help, but they hit diminishing returns after a few
iterations and can burn time/usage. For the hackathon, Rev should produce a
recovery prompt instead of automatically fixing.

### Background Is Useful Later

OpenAI recommends foreground review only for tiny changes and background review
for multi-file changes. Rev can copy this later, but the MVP should run
foreground for simplicity.

## Implication For The Hackathon Spec

The strongest Rev demo is not "another code review command."

It is:

> A `/goal` completion gate that preserves the original goal, captures evidence,
> runs validators, asks a second agent, and returns a trust report plus recovery
> prompt.

This fits the Harness / Skills Track because it is about harness design,
spec discipline, and delegation craft.
