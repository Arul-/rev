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
import { serve } from "../src/server";
import { init } from "../src/init";

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

test("init installs Rev config and Codex Stop hook idempotently", async () => {
  const first = await init(dir);

  expect(first).toContain("Initialized Rev");
  expect(first).toContain(".rev/goal.md");
  expect(first).toContain(".codex/hooks.json");
  expect(first).toContain(".codex/hooks/rev-stop.mjs");
  expect(existsSync(join(dir, ".rev", "config.json"))).toBe(true);
  expect(existsSync(join(dir, ".codex", "hooks.json"))).toBe(true);

  const hooks = JSON.parse(await readFile(join(dir, ".codex", "hooks.json"), "utf8"));
  expect(hooks.hooks.Stop[0].hooks[0].command).toContain("rev-stop.mjs");

  const second = await init(dir);
  expect(second).toContain("Already present:");
  expect(second).toContain(".rev/goal.md");
});

test("init preserves unrelated Codex hooks when installing Rev hook", async () => {
  await mkdir(join(dir, ".codex"), { recursive: true });
  await writeFile(join(dir, ".codex", "hooks.json"), JSON.stringify({
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "echo existing",
            },
          ],
        },
      ],
    },
  }));

  await init(dir);

  const hooks = JSON.parse(await readFile(join(dir, ".codex", "hooks.json"), "utf8"));
  const commands = JSON.stringify(hooks.hooks.Stop);
  expect(commands).toContain("echo existing");
  expect(commands).toContain("rev-stop.mjs");

  await init(dir);
  const second = await readFile(join(dir, ".codex", "hooks.json"), "utf8");
  expect((second.match(/rev-stop\.mjs/g) || []).length).toBe(1);
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
    evidence: { insideGitRepo: true, root: dir, status: " M file.ts\n", stagedDiff: "", unstagedDiff: "", combinedDiff: 'diff\n+ evidence: ".rev/report.md"', untrackedFiles: [] },
    testRun: { command: "bun test", exitCode: 0, stdout: "", stderr: "", skipped: false },
  });

  expect(validators.checks.find((check) => check.name === "tests_completed")?.status).toBe("pass");
  expect(validators.checks.find((check) => check.name === "rev_artifacts_excluded")?.status).toBe("pass");
});

test("validators fail when generated .rev files are actual review evidence paths", async () => {
  const validators = buildValidators({
    cwd: dir,
    goal: "Build Rev",
    evidence: {
      insideGitRepo: true,
      root: dir,
      status: " M .rev/report.md\n",
      stagedDiff: "",
      unstagedDiff: "diff --git a/.rev/report.md b/.rev/report.md\n",
      combinedDiff: "",
      untrackedFiles: [],
    },
    testRun: { command: "bun test", exitCode: 0, stdout: "", stderr: "", skipped: false },
  });

  expect(validators.checks.find((check) => check.name === "rev_artifacts_excluded")?.status).toBe("fail");
});

test("review JSON parser accepts JSON followed by Markdown", () => {
  const parsed = parseReviewJson('{"verdict":"approve","goal_satisfied":true,"goal_interpretation":"Do it","summary":"done","findings":[],"next_steps":[]}\n\n## Notes');
  expect(parsed?.verdict).toBe("approve");
});

test("review JSON parser normalizes evidence-only findings and string decision paths", () => {
  const parsed = parseReviewJson(JSON.stringify({
    verdict: "needs_attention",
    goal_satisfied: false,
    goal_interpretation: "Build Rev",
    summary: "Serve is not demonstrated.",
    findings: [{ severity: "high", title: "Serve gap", evidence: "No serve smoke test." }],
    next_steps: [],
    recovery_prompt: "Add serve smoke test.",
    decision_paths: ["Serve needs evidence."],
  }));

  expect(parsed?.findings[0].body).toContain("No serve smoke test");
  expect(parsed?.decision_paths?.[0].observation).toContain("Serve needs evidence");
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

test("serve exposes dashboard html and latest artifact state", async () => {
  await mkdir(join(dir, ".rev"), { recursive: true });
  await writeFile(join(dir, ".rev", "goal.md"), "Build Rev inspector.\n");
  await writeFile(join(dir, ".rev", "review.json"), JSON.stringify({
    verdict: "approve",
    goal_satisfied: true,
    goal_interpretation: "Build Rev inspector.",
    summary: "Dashboard works.",
    findings: [],
    next_steps: [],
  }));
  await writeFile(join(dir, ".rev", "validators.json"), JSON.stringify({ ok: true, checks: [{ name: "goal_present", status: "pass", message: "ok" }] }));
  await writeFile(join(dir, ".rev", "test-output.txt"), "Command: bun test\nExit code: 0\n");
  await writeFile(join(dir, ".rev", "memory.jsonl"), `${JSON.stringify({ timestamp: new Date().toISOString(), verdict: "approve", summary: "ok" })}\n`);
  await writeFile(join(dir, ".rev", "decisions.jsonl"), `${JSON.stringify({
    timestamp: new Date().toISOString(),
    kind: "approval",
    intent: "Build Rev inspector.",
    observation: "Artifacts are visible.",
    decision: "Approve",
    recovery: "No recovery needed.",
    evidence: ".rev/report.md",
    copy_markdown: "**Intent:** Build Rev inspector.",
    tags: ["serve"],
  })}\n`);

  const { server, url } = await serve(dir, { reviewCommand: "internal", reviewMode: "goal", maxReviewBytes: 1000, memoryEntries: 5, port: 39001 });
  try {
    const html = await fetch(url).then((response) => response.text());
    const state = await fetch(`${url}/api/state`).then((response) => response.json());

    expect(html).toContain("Decision Path Rail");
    expect(JSON.stringify(state)).toContain("Build Rev inspector");
    expect(JSON.stringify(state)).toContain("goal_present");
    expect(JSON.stringify(state)).toContain("No recovery needed");
  } finally {
    server.stop(true);
  }
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
