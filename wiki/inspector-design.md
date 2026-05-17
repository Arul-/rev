# Inspector Design

Rev's inspector is the hackathon-visible surface. It should make agent drift
obvious without a narrator.

## Intent

Human:
- a builder returning to a Codex `/goal` run after the Ralph Loop
- likely tired, rushed, and demo-driven
- needs to know whether to trust the autonomous work

Job:
- see what the user meant
- see what Codex actually did
- see where it drifted or hallucinated
- copy the recovery prompt or decision path

Feel:
- an agent evaluation console
- precise, dense, alive
- closer to a flight recorder or trace viewer than a SaaS analytics dashboard

## Domain

Concepts from Rev's world:
- intent
- trace
- drift
- verdict
- evidence
- recovery
- replay
- evaluator
- decision path
- autonomous run

## Color World

Use colors that feel like an evaluation console:
- graphite canvas: working surface, terminal-adjacent
- phosphor green: pass/recovery available
- amber: drift/warning
- oxide red: hallucination or failed validator
- cyan trace line: active path between intent and recovery
- muted slate: evidence and timestamps

Do not make it a one-hue dark-blue dashboard. Color should communicate state,
not decorate.

## Signature

The signature element is the **Decision Path Rail**:

```text
Intent -> Observation -> Decision -> Recovery
```

It should be the center of the page. Every run has one or more rails. Each rail
has state color, evidence links, and copy controls.

This is the thing that should make Rev feel different from `claude-mem`.
`claude-mem` browses memories. Rev explains decisions.

## Layout

Desktop:
- top status strip: goal match, drift, tests, recovery
- left column: current run and raw evidence links
- center column: decision path rails
- right column: recovery prompt and copy actions
- bottom band: run history and search results

Mobile:
- top status strip remains first
- decision path rail appears before raw evidence
- recovery prompt copy button stays sticky near the bottom

## Information Hierarchy

Priority order:

1. Is the run safe to trust?
2. What did the user intend?
3. What did Codex actually do?
4. Where is the drift or hallucination?
5. What evidence supports the verdict?
6. What exact prompt should continue the work?
7. What decision path should be saved or copied?

Anything that does not answer one of these should be visually secondary.

## Data Model On Screen

The dashboard should render these sources:

- `.rev/goal.md`: raw goal
- `.rev/review.json`: verdict, interpreted goal, findings, recovery prompt
- `.rev/validators.json`: mechanical checks
- `.rev/test-output.txt`: test command and exit state
- `.rev/report.md`: human-readable report link/preview
- `.rev/memory.jsonl`: run history
- `.rev/decisions.jsonl`: decision paths

Never show raw diff as the main object. Show a diff summary and link to
`.rev/diff.patch` instead.

## Run States

Design explicit states:

- `Waiting`: no review exists yet
- `Collecting`: evidence files exist but review is missing
- `Reviewing`: reviewer command is running or report is being written
- `Needs Correction`: drift, failed validators, or recovery prompt exists
- `Approved`: goal satisfied and validators are acceptable
- `Inconclusive`: reviewer failed, JSON parse failed, or evidence insufficient

Each state needs:
- color
- label
- one-line explanation
- next action

## Drift And Hallucination

Drift should not be hidden in findings.

Show:
- drift level: `none`, `low`, `medium`, `high`
- hallucination flag: `none`, `suspected`, `confirmed`
- evidence line: one sentence explaining why
- affected files or missing files when known

Examples:

```text
Drift: High
Evidence: Goal asks for a CLI, but the run only changed documentation.
```

```text
Hallucination: Suspected
Evidence: Report claims tests were added, but no test files changed.
```

## Decision Path Rail

Each rail has four cells:

```text
Intent -> Observation -> Decision -> Recovery
```

Cell rules:
- `Intent`: Codex's interpreted goal, one sentence
- `Observation`: what actually happened, evidence-backed
- `Decision`: approve, correct, investigate, or reject
- `Recovery`: exact next prompt/action

Each cell can expand, but the collapsed rail must stay readable.

Rail states:
- green: approved path
- amber: drift path
- red: hallucination or failed validator path
- gray: inconclusive path
- cyan accent: currently selected path

## Search

Search is over decision paths first, run history second.

`rev search <query>` and dashboard search should match:
- intent
- observation
- decision
- recovery
- tags
- evidence path

Results should show the complete decision path, not isolated snippets. The goal
is to reuse the reasoning, not just find a word.

## Interactions

Required interactions:
- copy recovery prompt
- copy decision path Markdown
- copy next Codex prompt
- copy "what went wrong"
- filter paths by tag/status
- expand/collapse evidence
- open report
- open diff patch
- open test output
- pause/resume auto-refresh

Copy buttons should use icon buttons with labels/tooltips. The primary action is
`Copy Recovery`.

## Empty States

Before first run:

```text
Waiting for first Rev check
Run ./bin/rev check after Codex finishes a goal.
```

If `.rev/goal.md` is missing:

```text
No goal found
Create .rev/goal.md or run ./bin/rev check "your goal".
```

If artifacts are partial:

```text
Evidence collected, review pending
Status and tests are available. Verdict is not ready yet.
```

Empty states should be useful, not decorative.

## Error States

Show errors as operational facts:

- reviewer command failed
- structured JSON parse failed
- tests command missing
- not inside a Git repo
- report missing
- memory/decision JSONL malformed

For malformed JSONL, skip the bad line, show a warning, and keep rendering the
rest.

## Accessibility

- Do not rely on color alone; every state needs a label.
- Maintain readable contrast on dark surfaces.
- Keyboard focus must be visible.
- Copy buttons need accessible names.
- Auto-refresh should not steal focus.
- Provide a pause auto-refresh control.

## Motion

Use motion sparingly:
- pulse only while reviewing
- subtle highlight when files update
- no decorative animation
- no layout-shifting auto-refresh

The interface should feel alive because state changes, not because the page is
animated.

## Typography

Use a precise developer-tool type system:
- UI labels: compact sans
- evidence paths and commands: mono
- decision path body: readable sans

Do not make everything monospace. Mono is for evidence, commands, hashes, and
paths.

## Density

This is a work surface. It should be dense but not cramped.

Rules:
- status strip visible without scrolling
- first decision path visible above the fold
- recovery prompt visible on desktop without scrolling
- raw evidence preview can be below the fold
- mobile prioritizes verdict, decision path, recovery copy

## File Links

Evidence references should point to local artifact paths:
- `.rev/report.md`
- `.rev/diff.patch`
- `.rev/test-output.txt`
- `.rev/validators.json`

If possible, render short previews but keep the full files accessible.

## Privacy

The inspector is local-only by default:
- bind to `127.0.0.1`
- do not send artifacts to a remote server
- do not expose raw diffs as copy defaults
- respect `<private>...</private>` redaction in memory and decision paths

If a future hosted mode exists, it must be explicit.

## Implementation Constraints

For MVP:
- Bun HTTP server
- no frontend framework required unless Codex chooses one for speed
- no database
- no WebSocket required; polling is fine
- static HTML/CSS/JS is acceptable
- CSS variables should use Rev-specific names, not generic theme names

Suggested CSS token names:

```css
--rev-canvas
--rev-panel
--rev-panel-raised
--rev-trace
--rev-pass
--rev-drift
--rev-fail
--rev-muted
--rev-ink
```

## Demo Script

The demo should show:

1. `rev serve` open in browser.
2. Empty state waiting for a run.
3. A bad or incomplete Codex `/goal` run.
4. `rev check` updates the dashboard.
5. Drift turns high.
6. Decision path rail appears.
7. Click `Copy Recovery`.
8. Paste recovery prompt into Codex.

This is the moment judges understand Rev.

## Sponsor Hits

Make these visible in the product language:

- OpenAI: `/goal`, recovery prompt, Codex continuation
- Arize: eval, trace, drift, validators, LLM-as-judge
- IronClaw: trust layer, hallucination, evidence
- 65labs: less explanation, more demo

Do not put sponsor names in the UI. Use the vocabulary that resonates with
their goals.

## Visual Rules

- No landing-page hero.
- No marketing text.
- No nested cards.
- No decorative gradient orbs.
- Cards can be used for repeated decision paths only.
- Use 8px radius or less.
- Use stable dimensions for status cells so labels do not jump on refresh.
- Auto-refresh must not shift layout.
- Text must not overflow buttons or status cells.

## Status Language

Use terse labels:
- `Goal Match`
- `Drift`
- `Hallucination`
- `Tests`
- `Validators`
- `Recovery`
- `Evidence`

Good demo states:

```text
Goal Match  42%
Drift       High
Tests       Pass
Recovery    Ready
```

## Copy Actions

The inspector must have copy buttons for:
- recovery prompt
- decision path Markdown
- what went wrong
- next Codex prompt

The copy action is part of the demo. It shows that Rev does not only diagnose;
it hands the user the next move.

## Sponsor Alignment

OpenAI / Codex:
- emphasize `/goal` course correction
- show Codex becoming more reliable through a harness

Arize:
- use eval/trace/drift language
- show evidence, validators, and LLM-as-judge output

IronClaw / NEAR AI:
- position as trust of intent, complementary to secure execution

65labs / Superteam / Network School:
- make the demo visual and easy to understand in a room

## Defaults To Avoid

Avoid:
- generic metric-card dashboard
- sidebar-heavy admin template
- colorful status confetti
- raw Markdown viewer
- terminal-only UI

Replace with:
- decision path rail as the primary object
- compact status strip
- evidence/recovery split
- copyable decision paths
- searchable run history

## Acceptance Criteria

The inspector succeeds if someone can glance at it and answer:
- What did the user ask?
- What did Codex do?
- Did it drift?
- What evidence proves that?
- What should Codex do next?
- What can I copy into the next run?

It wins the room if someone watching the demo says:

```text
Oh, it caught the agent lying about being done.
```
