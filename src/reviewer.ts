import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RevConfig } from "./config";
import type { GitEvidence } from "./git";
import type { TestRun } from "./tests";
import type { ValidatorReport } from "./validators";
import { runCommand } from "./shell";

export type ReviewFinding = {
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  body: string;
  file?: string;
  line_start?: number;
  line_end?: number;
  confidence?: number;
  recommendation?: string;
};

export type DecisionPath = {
  timestamp: string;
  kind: string;
  intent: string;
  observation: string;
  decision: string;
  recovery: string;
  evidence: string;
  copy_markdown: string;
  tags: string[];
};

export type ReviewJson = {
  verdict: "approve" | "needs_attention" | "inconclusive";
  goal_satisfied: boolean | "inconclusive";
  goal_interpretation: string;
  summary: string;
  drift?: { level?: "none" | "low" | "medium" | "high"; evidence?: string };
  hallucination?: { status?: "none" | "suspected" | "confirmed"; evidence?: string };
  findings: ReviewFinding[];
  next_steps: string[];
  recovery_prompt?: string;
  decision_paths?: DecisionPath[];
};

export type ReviewerResult = {
  review: ReviewJson;
  rawOutput: string;
  parsed: boolean;
  command: string;
  exitCode?: number;
};

export async function runReviewer(args: {
  cwd: string;
  config: RevConfig;
  goal: string;
  evidence: GitEvidence;
  testRun: TestRun;
  validators: ValidatorReport;
}): Promise<ReviewerResult> {
  const prompt = await buildReviewerPrompt(args);
  const command = args.config.reviewCommand;

  if (!command.trim() || command === "internal") {
    const review = heuristicReview(args.goal, args.evidence, args.testRun, args.validators);
    return { review, rawOutput: JSON.stringify(review, null, 2), parsed: true, command: "internal" };
  }

  const result = await runCommand(command, args.cwd, prompt);
  const rawOutput = `${result.stdout}${result.stderr ? `\n\n[stderr]\n${result.stderr}` : ""}`;
  const parsed = parseReviewJson(rawOutput);
  if (parsed) return { review: parsed, rawOutput, parsed: true, command, exitCode: result.exitCode };

  const fallback = heuristicReview(args.goal, args.evidence, args.testRun, args.validators, {
    verdict: "inconclusive",
    summary: `Reviewer command could not produce parseable JSON. Exit code: ${result.exitCode}.`,
    rawOutput,
  });
  return { review: fallback, rawOutput, parsed: false, command, exitCode: result.exitCode };
}

export async function buildReviewerPrompt(args: {
  cwd: string;
  config: RevConfig;
  goal: string;
  evidence: GitEvidence;
  testRun: TestRun;
  validators: ValidatorReport;
}): Promise<string> {
  const memory = await readRecentMemory(args.cwd, args.config.memoryEntries);
  const diff = truncate(args.evidence.combinedDiff, args.config.maxReviewBytes);
  const testText = [
    args.testRun.skipped ? `Skipped: ${args.testRun.skipReason}` : `Command: ${args.testRun.command}\nExit code: ${args.testRun.exitCode}`,
    args.testRun.stdout,
    args.testRun.stderr,
  ].join("\n");

  return `You are Rev, a second-opinion reviewer for a Codex /goal run.

Return compact JSON first using this shape:
{
  "verdict": "approve|needs_attention|inconclusive",
  "goal_satisfied": true,
  "goal_interpretation": "one sentence",
  "summary": "one sentence",
  "drift": {"level": "none|low|medium|high", "evidence": "one sentence"},
  "hallucination": {"status": "none|suspected|confirmed", "evidence": "one sentence"},
  "findings": [],
  "next_steps": [],
  "recovery_prompt": "",
  "decision_paths": []
}

Then add a short Markdown explanation. Judge whether the implementation satisfies the original goal, whether it drifted, what changed, tests/checks run, risks, and the prompt to resume if incomplete.

ORIGINAL GOAL:
${args.goal}

RECENT REV MEMORY:
${memory || "(none)"}

GIT STATUS:
${args.evidence.status || "(none)"}

UNTRACKED TEXT FILES:
${args.evidence.untrackedFiles.join("\n") || "(none)"}

COMBINED DIFF:
${diff || "(none)"}

TEST OUTPUT:
${truncate(testText, 40000)}

VALIDATORS:
${JSON.stringify(args.validators, null, 2)}
`;
}

export function parseReviewJson(output: string): ReviewJson | undefined {
  const fenced = output.match(/```json\s*([\s\S]*?)```/i)?.[1];
  const balanced = extractFirstJsonObject(output);
  const candidates = [fenced, balanced, output.slice(output.indexOf("{"), output.lastIndexOf("}") + 1)].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && parsed.verdict) return normalizeReview(parsed);
    } catch {
      // Try next candidate.
    }
  }
  return undefined;
}

function extractFirstJsonObject(output: string): string | undefined {
  const start = output.indexOf("{");
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < output.length; index += 1) {
    const char = output[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }
    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return output.slice(start, index + 1);
    }
  }
  return undefined;
}

export function heuristicReview(
  goal: string,
  evidence: GitEvidence,
  testRun: TestRun,
  validators: ValidatorReport,
  override?: { verdict?: ReviewJson["verdict"]; summary?: string; rawOutput?: string },
): ReviewJson {
  const failed = validators.checks.filter((check) => check.status === "fail");
  const warnings = validators.checks.filter((check) => check.status === "warn");
  const hasChanges = Boolean(evidence.status.trim() || evidence.combinedDiff.trim() || evidence.untrackedFiles.length);
  const testsFailed = !testRun.skipped && testRun.exitCode !== 0;
  const verdict = override?.verdict ?? (failed.length || testsFailed || !hasChanges ? "needs_attention" : "approve");
  const goalSatisfied = verdict === "approve";
  const recovery = goalSatisfied
    ? ""
    : "Continue the Rev goal by addressing failed validators, test failures, and any missing implementation evidence before running ./bin/rev check again.";
  const driftLevel = !hasChanges ? "high" : warnings.length ? "medium" : "low";
  const observation = failed.length
    ? `Failed validators: ${failed.map((check) => check.name).join(", ")}.`
    : testsFailed
      ? `Tests exited ${testRun.exitCode}.`
      : hasChanges
        ? "Reviewable implementation changes and test evidence were captured."
        : "No reviewable implementation changes were captured.";

  return {
    verdict,
    goal_satisfied: goalSatisfied,
    goal_interpretation: summarizeGoal(goal),
    summary: override?.summary ?? (goalSatisfied ? "The captured evidence appears to satisfy the goal." : observation),
    drift: {
      level: goalSatisfied ? "none" : driftLevel,
      evidence: goalSatisfied ? "No deterministic drift was detected." : observation,
    },
    hallucination: {
      status: "none",
      evidence: "No independent hallucination claim was detected by deterministic review.",
    },
    findings: failed.map((check) => ({
      severity: "high",
      title: check.name,
      body: check.message,
      confidence: 1,
      recommendation: recovery,
    })),
    next_steps: goalSatisfied ? [] : [recovery],
    recovery_prompt: recovery,
    decision_paths: [
      makeDecisionPath({
        kind: goalSatisfied ? "approval" : "drift_recovery",
        intent: summarizeGoal(goal),
        observation,
        decision: goalSatisfied ? "Approve the run." : "Treat the run as needing correction.",
        recovery: recovery || "No recovery needed.",
        tags: goalSatisfied ? ["approved"] : ["recovery", "validator"],
      }),
    ],
  };
}

export function makeDecisionPath(input: {
  kind: string;
  intent: string;
  observation: string;
  decision: string;
  recovery: string;
  tags: string[];
}): DecisionPath {
  const copy = [
    `**Intent:** ${input.intent}`,
    `**Observation:** ${input.observation}`,
    `**Decision:** ${input.decision}`,
    `**Recovery:** ${input.recovery}`,
  ].join("\n");

  return {
    timestamp: new Date().toISOString(),
    kind: input.kind,
    intent: input.intent,
    observation: input.observation,
    decision: input.decision,
    recovery: input.recovery,
    evidence: ".rev/report.md",
    copy_markdown: copy,
    tags: input.tags,
  };
}

function normalizeReview(input: Partial<ReviewJson>): ReviewJson {
  const verdict = input.verdict === "approve" || input.verdict === "needs_attention" || input.verdict === "inconclusive" ? input.verdict : "inconclusive";
  return {
    verdict,
    goal_satisfied: typeof input.goal_satisfied === "boolean" ? input.goal_satisfied : verdict === "approve",
    goal_interpretation: input.goal_interpretation || "Review the current implementation against the Rev goal.",
    summary: input.summary || "Reviewer did not provide a summary.",
    drift: input.drift,
    hallucination: input.hallucination,
    findings: Array.isArray(input.findings) ? input.findings.map(normalizeFinding) : [],
    next_steps: Array.isArray(input.next_steps) ? input.next_steps : [],
    recovery_prompt: input.recovery_prompt,
    decision_paths: Array.isArray(input.decision_paths) ? input.decision_paths.map((path) => normalizeDecisionPath(path, input)).filter(Boolean) as DecisionPath[] : [],
  };
}

function normalizeFinding(input: unknown): ReviewFinding {
  if (!input || typeof input !== "object") {
    return {
      severity: "low",
      title: "Reviewer finding",
      body: String(input || "Reviewer returned an empty finding."),
    };
  }
  const finding = input as Partial<ReviewFinding> & { evidence?: string };
  const severity = finding.severity === "critical" || finding.severity === "high" || finding.severity === "medium" || finding.severity === "low" ? finding.severity : "low";
  return {
    ...finding,
    severity,
    title: finding.title || "Reviewer finding",
    body: finding.body || finding.evidence || "Reviewer did not provide finding details.",
  };
}

function normalizeDecisionPath(input: unknown, review: Partial<ReviewJson>): DecisionPath | undefined {
  if (!input) return undefined;
  if (typeof input === "string") {
    return makeDecisionPath({
      kind: "review_note",
      intent: review.goal_interpretation || "Review the Rev goal.",
      observation: input,
      decision: review.verdict === "approve" ? "Approve the run." : "Use this note while continuing the run.",
      recovery: review.recovery_prompt || "Continue from the latest Rev report.",
      tags: ["review-note"],
    });
  }
  if (typeof input !== "object") return undefined;
  const path = input as Partial<DecisionPath>;
  return makeDecisionPath({
    kind: path.kind || "review_path",
    intent: path.intent || review.goal_interpretation || "Review the Rev goal.",
    observation: path.observation || review.summary || "No observation provided.",
    decision: path.decision || (review.verdict === "approve" ? "Approve the run." : "Continue the run."),
    recovery: path.recovery || review.recovery_prompt || "Continue from the latest Rev report.",
    tags: Array.isArray(path.tags) ? path.tags : [],
  });
}

function summarizeGoal(goal: string): string {
  const compact = goal
    .replace(/^# .+$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
  return truncate(compact, 220) || "Review this Codex goal implementation.";
}

function truncate(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return value;
  return new TextDecoder().decode(encoded.slice(0, maxBytes)) + "\n[truncated]";
}

async function readRecentMemory(cwd: string, count: number): Promise<string> {
  const path = join(cwd, ".rev", "memory.jsonl");
  if (!existsSync(path)) return "";
  const lines = (await readFile(path, "utf8")).trim().split(/\r?\n/).filter(Boolean).slice(-count);
  return lines.join("\n");
}
