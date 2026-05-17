import { loadConfig } from "./config";
import { ensureRevDir, loadGoal } from "./fs";
import { captureGitEvidence } from "./git";
import { runTests } from "./tests";
import { buildValidators, writeValidators } from "./validators";
import { runReviewer } from "./reviewer";
import { writeReviewArtifacts } from "./report";
import { ensureInspector } from "./server";

export async function check(cwd: string, initialGoal?: string): Promise<number> {
  await ensureRevDir(cwd);
  const config = await loadConfig(cwd);
  const goal = await loadGoal(cwd, initialGoal);
  await ensureInspector(cwd, config);

  const evidence = await captureGitEvidence(cwd);
  const testRun = await runTests(cwd, config.testCommand);
  const preValidators = buildValidators({ cwd, goal, evidence, testRun });
  await writeValidators(cwd, preValidators);

  const reviewer = await runReviewer({ cwd, config, goal, evidence, testRun, validators: preValidators });
  const writes = await writeReviewArtifacts({ cwd, config, goal, evidence, testRun, validators: preValidators, reviewer });
  const finalValidators = buildValidators({
    cwd,
    goal,
    evidence,
    testRun,
    reportWritten: true,
    memoryWritten: writes.memoryWritten,
    decisionsWritten: writes.decisionsWritten,
  });
  await writeValidators(cwd, finalValidators);

  console.log("Rev report written to .rev/report.md");
  if (reviewer.review.verdict !== "approve" || reviewer.review.goal_satisfied !== true) {
    console.log("Recovery prompt written to .rev/recovery-prompt.md");
  }
  return 0;
}
