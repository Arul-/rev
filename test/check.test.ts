import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config";
import { loadGoal } from "../src/fs";
import { captureGitEvidence } from "../src/git";
import { runTests } from "../src/tests";
import { buildValidators } from "../src/validators";
import { parseReviewJson } from "../src/reviewer";
import { check } from "../src/check";
import { searchDecisionPaths } from "../src/search";

let dir = "";

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "rev-test-"));
});

afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

test("config defaults are usable without .rev/config.json", async () => {
  const config = await loadConfig(dir);
  expect(config.reviewCommand).toBe("codex exec -s read-only");
  expect(config.maxReviewBytes).toBe(200000);
});

test("goal loading creates .rev/goal.md from an initial argument", async () => {
  const goal = await loadGoal(dir, "Ship the smallest useful Rev CLI.");
  expect(goal).toContain("Ship the smallest useful Rev CLI.");
  expect(existsSync(join(dir, ".rev", "goal.md"))).toBe(true);
});

test("missing goal fails clearly", async () => {
  await expect(loadGoal(dir)).rejects.toThrow("Missing .rev/goal.md");
});

test("git evidence excludes .rev artifacts and includes untracked text content", async () => {
  await run("git init");
  await writeFile(join(dir, "tracked.txt"), "old\n");
  await run("git add tracked.txt");
  await run("git commit -m init");
  await mkdir(join(dir, ".rev"), { recursive: true });
  await writeFile(join(dir, ".rev", "report.md"), "generated\n");
  await writeFile(join(dir, "tracked.txt"), "new\n");
  await writeFile(join(dir, "src.ts"), "export const value = 1;\n");

  const evidence = await captureGitEvidence(dir);

  expect(evidence.insideGitRepo).toBe(true);
  expect(evidence.status).not.toContain(".rev/");
  expect(evidence.untrackedFiles).toContain("src.ts");
  expect(evidence.combinedDiff).toContain("export const value = 1");
});

test("test runner writes command output for success and failure", async () => {
  await mkdir(join(dir, ".rev"), { recursive: true });
  const success = await runTests(dir, "printf ok");
  expect(success.exitCode).toBe(0);
  expect(await readFile(join(dir, ".rev", "test-output.txt"), "utf8")).toContain("STDOUT");

  const failure = await runTests(dir, "exit 7");
  expect(failure.exitCode).toBe(7);
  expect(await readFile(join(dir, ".rev", "test-output.txt"), "utf8")).toContain("Exit code: 7");
});

test("validators report deterministic check states", async () => {
  const validators = buildValidators({
    cwd: dir,
    goal: "Build Rev",
    evidence: { insideGitRepo: true, root: dir, status: " M file.ts\n", stagedDiff: "", unstagedDiff: "", combinedDiff: "diff", untrackedFiles: [] },
    testRun: { command: "bun test", exitCode: 0, stdout: "", stderr: "", skipped: false },
  });

  expect(validators.checks.find((check) => check.name === "tests_completed")?.status).toBe("pass");
  expect(validators.checks.find((check) => check.name === "rev_artifacts_excluded")?.status).toBe("pass");
});

test("review JSON parser accepts JSON followed by Markdown", () => {
  const parsed = parseReviewJson('{"verdict":"approve","goal_satisfied":true,"goal_interpretation":"Do it","summary":"done","findings":[],"next_steps":[]}\n\n## Notes');
  expect(parsed?.verdict).toBe("approve");
});

test("check writes report, recovery, memory, and decisions with internal reviewer", async () => {
  await run("git init");
  await writeFile(join(dir, "package.json"), JSON.stringify({ scripts: { test: "bun test" }, devDependencies: { "@types/bun": "latest" } }));
  await mkdir(join(dir, "test"), { recursive: true });
  await writeFile(join(dir, "test/sample.test.ts"), 'import { expect, test } from "bun:test"; test("ok", () => expect(1).toBe(1));\n');
  await run("git add package.json test/sample.test.ts");
  await run("git commit -m init");
  await mkdir(join(dir, ".rev"), { recursive: true });
  await writeFile(join(dir, ".rev", "goal.md"), "Make a code change.\n");
  await writeFile(join(dir, ".rev", "config.json"), JSON.stringify({ reviewCommand: "internal", testCommand: "bun test" }));
  await writeFile(join(dir, "feature.ts"), "export const feature = true;\n");

  const exit = await check(dir);

  expect(exit).toBe(0);
  expect(await readFile(join(dir, ".rev", "report.md"), "utf8")).toContain("# Rev Report");
  expect(await readFile(join(dir, ".rev", "memory.jsonl"), "utf8")).toContain("goal_interpretation");
  expect(await readFile(join(dir, ".rev", "decisions.jsonl"), "utf8")).toContain("copy_markdown");
});

test("decision path search returns complete paths", async () => {
  await mkdir(join(dir, ".rev"), { recursive: true });
  await writeFile(join(dir, ".rev", "decisions.jsonl"), `${JSON.stringify({
    timestamp: new Date().toISOString(),
    kind: "drift_recovery",
    intent: "Build CLI",
    observation: "Only docs changed",
    decision: "Correct",
    recovery: "Implement check",
    evidence: ".rev/report.md",
    copy_markdown: "**Intent:** Build CLI",
    tags: ["drift"],
  })}\n`);

  const results = await searchDecisionPaths(dir, "docs");
  expect(results).toHaveLength(1);
  expect(results[0].recovery).toBe("Implement check");
});

async function run(command: string) {
  const proc = Bun.spawn(["/bin/sh", "-lc", command], {
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_NAME: "Rev Test", GIT_AUTHOR_EMAIL: "rev@example.test", GIT_COMMITTER_NAME: "Rev Test", GIT_COMMITTER_EMAIL: "rev@example.test" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (exitCode !== 0) throw new Error(`${command} failed\n${stdout}\n${stderr}`);
}
