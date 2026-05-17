import { appendFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { stripPrivateBlocks, writeText } from "./fs";
import type { RevConfig } from "./config";
import type { GitEvidence } from "./git";
import type { TestRun } from "./tests";
import type { ValidatorReport } from "./validators";
import type { DecisionPath, ReviewJson, ReviewerResult } from "./reviewer";

export function shouldWriteRecovery(review: ReviewJson): boolean {
  return review.verdict === "needs_attention" || review.verdict === "inconclusive" || review.goal_satisfied !== true;
}

export async function writeReviewArtifacts(args: {
  cwd: string;
  config: RevConfig;
  goal: string;
  evidence: GitEvidence;
  testRun: TestRun;
  validators: ValidatorReport;
  reviewer: ReviewerResult;
}): Promise<{ memoryWritten: boolean; decisionsWritten: boolean }> {
  const { cwd, reviewer } = args;
  await writeText(join(cwd, ".rev", "reviewer-output.txt"), reviewer.rawOutput);
  await writeText(join(cwd, ".rev", "review.json"), `${JSON.stringify(reviewer.review, null, 2)}\n`);
  await writeText(join(cwd, ".rev", "report.md"), buildReport(args));

  if (shouldWriteRecovery(reviewer.review)) {
    await writeText(join(cwd, ".rev", "recovery-prompt.md"), `${reviewer.review.recovery_prompt || defaultRecoveryPrompt(reviewer.review)}\n`);
  } else {
    await writeText(join(cwd, ".rev", "recovery-prompt.md"), "");
  }

  const memoryEntry = buildMemoryEntry(args);
  await appendFile(join(cwd, ".rev", "memory.jsonl"), `${JSON.stringify(memoryEntry)}\n`, "utf8");

  const decisionPaths = normalizeDecisionPaths(reviewer.review);
  for (const path of decisionPaths) {
    await appendFile(join(cwd, ".rev", "decisions.jsonl"), `${JSON.stringify(path)}\n`, "utf8");
  }

  return { memoryWritten: true, decisionsWritten: decisionPaths.length > 0 };
}

export function buildReport(args: {
  goal: string;
  evidence: GitEvidence;
  testRun: TestRun;
  validators: ValidatorReport;
  reviewer: ReviewerResult;
}): string {
  const review = args.reviewer.review;
  const failedValidators = args.validators.checks.filter((check) => check.status === "fail" || check.status === "warn");
  const findings = review.findings.length
    ? review.findings.map((finding) => `- **${finding.severity} ${finding.title}:** ${finding.body}`).join("\n")
    : "- None reported.";

  return `# Rev Report

## Verdict

Goal satisfied: ${review.goal_satisfied === true ? "yes" : review.goal_satisfied === false ? "no" : "inconclusive"}

Verdict: ${review.verdict}

Interpreted goal: ${review.goal_interpretation}

Summary: ${review.summary}

## Evidence

- Goal: .rev/goal.md
- Diff: .rev/diff.patch (${args.evidence.combinedDiff.length} characters)
- Status: .rev/status.txt
- Tests: .rev/test-output.txt (${args.testRun.skipped ? `skipped: ${args.testRun.skipReason}` : `${args.testRun.command} exited ${args.testRun.exitCode}`})
- Reviewer: ${args.reviewer.command}${args.reviewer.exitCode === undefined ? "" : ` exited ${args.reviewer.exitCode}`}
- Structured review parsed: ${args.reviewer.parsed ? "yes" : "no"}

## Validators

${args.validators.checks.map((check) => `- ${check.status.toUpperCase()} ${check.name}: ${check.message}`).join("\n")}

## Drift

- Level: ${review.drift?.level ?? "inconclusive"}
- Evidence: ${review.drift?.evidence ?? "No drift evidence was provided."}
- Hallucination: ${review.hallucination?.status ?? "inconclusive"}
- Hallucination evidence: ${review.hallucination?.evidence ?? "No hallucination evidence was provided."}

## Findings

${findings}

## Risks

${failedValidators.length ? failedValidators.map((check) => `- ${check.name}: ${check.message}`).join("\n") : "- No deterministic validator risks remain."}

## Missing Tests

${args.testRun.skipped ? `- Tests were skipped: ${args.testRun.skipReason}` : args.testRun.exitCode === 0 ? "- None detected by Rev." : `- Test command failed with exit code ${args.testRun.exitCode}.`}

## Recovery Prompt

${shouldWriteRecovery(review) ? review.recovery_prompt || defaultRecoveryPrompt(review) : "No recovery prompt needed."}

`;
}

function buildMemoryEntry(args: {
  goal: string;
  testRun: TestRun;
  validators: ValidatorReport;
  reviewer: ReviewerResult;
}) {
  const failedValidators = args.validators.checks.filter((check) => check.status === "fail").map((check) => check.name);
  return {
    timestamp: new Date().toISOString(),
    goal_hash: `sha256:${createHash("sha256").update(args.goal).digest("hex")}`,
    goal_interpretation: stripPrivateBlocks(args.reviewer.review.goal_interpretation),
    verdict: args.reviewer.review.verdict,
    goal_satisfied: args.reviewer.review.goal_satisfied,
    summary: stripPrivateBlocks(args.reviewer.review.summary),
    findings_count: args.reviewer.review.findings.length,
    failed_validators: failedValidators,
    test_exit_code: args.testRun.exitCode ?? null,
    report_path: ".rev/report.md",
    recovery_prompt_path: shouldWriteRecovery(args.reviewer.review) ? ".rev/recovery-prompt.md" : null,
  };
}

function normalizeDecisionPaths(review: ReviewJson): DecisionPath[] {
  return (review.decision_paths ?? []).map((path) => ({
    ...path,
    timestamp: path.timestamp || new Date().toISOString(),
    evidence: path.evidence || ".rev/report.md",
    copy_markdown: path.copy_markdown || [
      `**Intent:** ${path.intent}`,
      `**Observation:** ${path.observation}`,
      `**Decision:** ${path.decision}`,
      `**Recovery:** ${path.recovery}`,
    ].join("\n"),
    tags: Array.isArray(path.tags) ? path.tags : [],
  }));
}

function defaultRecoveryPrompt(review: ReviewJson): string {
  return `Continue the Rev goal. The latest review verdict was ${review.verdict}: ${review.summary}`;
}
