import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GitEvidence } from "./git";
import type { TestRun } from "./tests";
import { writeText } from "./fs";

export type ValidatorStatus = "pass" | "fail" | "warn" | "skip";

export type ValidatorCheck = {
  name: string;
  status: ValidatorStatus;
  message: string;
};

export type ValidatorReport = {
  ok: boolean;
  checks: ValidatorCheck[];
};

export function buildValidators(args: {
  cwd: string;
  goal: string;
  evidence: GitEvidence;
  testRun: TestRun;
  reportWritten?: boolean;
  memoryWritten?: boolean;
  decisionsWritten?: boolean;
}): ValidatorReport {
  const { cwd, goal, evidence, testRun } = args;
  const noChangeExpected = /\b(no code change|no changes expected|documentation only|docs only)\b/i.test(goal);
  const hasReviewableChanges = Boolean(evidence.status.trim() || evidence.combinedDiff.trim() || evidence.untrackedFiles.length);
  const revArtifactsExcluded = ![evidence.status, evidence.stagedDiff, evidence.unstagedDiff, evidence.combinedDiff, evidence.untrackedFiles.join("\n")]
    .join("\n")
    .includes(".rev/");

  const checks: ValidatorCheck[] = [
    {
      name: "goal_present",
      status: goal.trim() ? "pass" : "fail",
      message: goal.trim() ? ".rev/goal.md exists and is non-empty" : ".rev/goal.md is missing or empty",
    },
    {
      name: "inside_git_repo",
      status: evidence.insideGitRepo ? "pass" : "fail",
      message: evidence.insideGitRepo ? `Git repository detected${evidence.root ? ` at ${evidence.root}` : ""}` : "Rev is not running inside a Git repository",
    },
    {
      name: "working_tree_has_reviewable_changes",
      status: hasReviewableChanges || noChangeExpected ? "pass" : "warn",
      message: hasReviewableChanges
        ? "Reviewable changes were captured"
        : noChangeExpected
          ? "No reviewable changes found, but the goal appears to allow that"
          : "No reviewable changes were found outside .rev/",
    },
    {
      name: "tests_completed",
      status: testRun.skipped ? "skip" : testRun.exitCode === 0 ? "pass" : "fail",
      message: testRun.skipped
        ? `Tests skipped: ${testRun.skipReason}`
        : `Test command '${testRun.command}' exited ${testRun.exitCode}`,
    },
    {
      name: "rev_artifacts_excluded",
      status: revArtifactsExcluded ? "pass" : "fail",
      message: revArtifactsExcluded ? "Generated .rev/ artifacts are excluded from review evidence" : ".rev/ artifacts appeared in review evidence",
    },
    {
      name: "report_written",
      status: args.reportWritten ?? existsSync(join(cwd, ".rev", "report.md")) ? "pass" : "skip",
      message: args.reportWritten ?? existsSync(join(cwd, ".rev", "report.md")) ? ".rev/report.md is written" : "Report has not been written yet",
    },
    {
      name: "memory_written",
      status: args.memoryWritten ?? existsSync(join(cwd, ".rev", "memory.jsonl")) ? "pass" : "skip",
      message: args.memoryWritten ?? existsSync(join(cwd, ".rev", "memory.jsonl")) ? ".rev/memory.jsonl has entries" : "Memory has not been written yet",
    },
    {
      name: "decisions_written",
      status: args.decisionsWritten ?? existsSync(join(cwd, ".rev", "decisions.jsonl")) ? "pass" : "skip",
      message: args.decisionsWritten ?? existsSync(join(cwd, ".rev", "decisions.jsonl")) ? ".rev/decisions.jsonl has entries" : "No decision paths have been written yet",
    },
  ];

  return { ok: checks.every((check) => check.status === "pass" || check.status === "skip"), checks };
}

export async function writeValidators(cwd: string, report: ValidatorReport): Promise<void> {
  await writeText(join(cwd, ".rev", "validators.json"), `${JSON.stringify(report, null, 2)}\n`);
}
