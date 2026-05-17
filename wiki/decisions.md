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

Default reviewer command:

```bash
codex review --uncommitted
```

Reason:
- available in the local Codex CLI
- fits the event
- avoids building custom model plumbing before the behavior is proven

Later reviewer backends can include Claude, Gemini, or a configured command.
