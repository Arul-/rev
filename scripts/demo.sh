#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() {
  printf '\n\033[1m%s\033[0m\n' "$1"
}

run() {
  printf '\n\033[36m$ %s\033[0m\n' "$*"
  "$@"
}

summarize_report() {
  bun -e '
    const report = await Bun.file(".rev/report.md").text();
    const wanted = [
      /^Goal satisfied:/m,
      /^Verdict:/m,
      /^- Level:/m,
      /^No recovery prompt needed\\./m,
    ];
    for (const pattern of wanted) {
      const match = report.match(pattern);
      if (match) console.log(match[0]);
    }
  '
}

bold "Rev live demo"
cat <<'INTRO'
Pitch:
  Codex says "done." Rev checks whether the goal is actually done.

Flow:
  1. Prove the project still works.
  2. Run Rev's second-opinion check.
  3. Show the verdict and decision path.
  4. Open the local inspector.
INTRO

run bun test

bold "Run Rev check"
run ./bin/rev check

bold "Judge-facing verdict"
summarize_report

bold "Decision path search"
run ./bin/rev search approval

bold "Inspector"
cat <<'OUTRO'
Next command opens the local Rev dashboard.
Keep this terminal open while showing the browser.
Press Ctrl-C when the demo is done.
OUTRO

run ./bin/rev serve
