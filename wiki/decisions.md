# Rev Decisions

## 2026-05-17: Use Bun

Rev is built as a Bun CLI for the hackathon.

Reason:
- fast setup
- simple executable scripts
- built-in test runner
- no runtime dependency needed for the MVP

## 2026-05-17: Build CLI Before Photon/MCP

Rev should be a plain CLI first.

Reason:
- the Ralph Loop expectation is Codex `/goal`
- a CLI is easiest for Codex to build and test during the event
- Photon/MCP can wrap a working loop later

## 2026-05-17: Use Codex Review As The First Reviewer

Initial idea:

```bash
codex review --uncommitted
```

Reason:
- available in the local Codex CLI
- fits the event
- avoids building custom model plumbing before the behavior is proven

Later reviewer backends can include Claude, Gemini, or a configured command.

## 2026-05-17: Prefer Structured `codex exec` For MVP Review

Updated default reviewer command:

```bash
codex exec -s read-only
```

Reason:
- `codex review --uncommitted` is useful, but it is optimized for generic code
  review.
- Rev needs goal-aware output: goal satisfaction, validators, recovery prompt,
  and JSON verdict.
- `codex exec` lets Rev send a custom prompt and ask for structured output.

Rev can still support `codex review --uncommitted` as a backend later.

## 2026-05-17: Add Deterministic Validators

Rev should not rely only on an LLM reviewer.

Validators create mechanical evidence before review:
- goal present
- inside git repo
- reviewable changes exist
- tests ran or were explicitly skipped
- `.rev/` artifacts excluded

The reviewer then interprets those facts against the goal.

## 2026-05-17: Copy Claude-Mem's Pattern, Not Its Stack

Rev should add lightweight run memory, not a full clone of `claude-mem`.

Reason:
- `claude-mem` is built for cross-session personal memory with hooks, a worker
  service, SQLite, vector search, MCP tools, and a web inspector.
- Rev's immediate need is narrower: help the next `/goal` run understand what
  the previous Rev check concluded.
- A local `.rev/memory.jsonl` file is enough for the hackathon demo and keeps
  the implementation testable inside a Bun CLI.

Memory entries should be compact and private by default: no raw diffs, no raw
prompts, and no content from `<private>...</private>` blocks.

The inspector idea is still valuable. Defer it until after `rev check` works,
then consider `rev serve` for browsing run history.

## 2026-05-17: Store Codex's Interpreted Goal

Rev memory should store Codex's concise interpretation of what the user asked.

Reason:
- the user may describe the goal conversationally or indirectly
- later reviewers need a clear target, not a transcript
- storing only the raw prompt makes repeated-run memory less useful

The interpretation must stay scoped to the user's request. It should clarify,
not expand, the task.
