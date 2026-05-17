import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const hookScript = `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const input = readHookInput();

if (process.env.REV_HOOK_ACTIVE === "1" || input.stop_hook_active) {
  allow("Rev hook recursion guard skipped this stop.");
}

const cwd = typeof input.cwd === "string" ? input.cwd : process.cwd();
const root = gitRoot(cwd);

if (!root || !existsSync(join(root, ".rev", "goal.md"))) {
  allow("Rev is not configured for this repository.");
}

if (!looksLikeCompletion(input.last_assistant_message)) {
  allow("Assistant is not presenting the run as done.");
}

const revCommand = existsSync(join(root, "bin", "rev")) ? join(root, "bin", "rev") : "rev";
const result = spawnSync(revCommand, ["check"], {
  cwd: root,
  env: { ...process.env, REV_HOOK_ACTIVE: "1" },
  encoding: "utf8",
  timeout: 580_000,
});

writeFileSync(
  join(root, ".rev", "hook-output.txt"),
  [
    \`timestamp=\${new Date().toISOString()}\`,
    \`exit=\${result.status ?? "signal"}\`,
    result.stdout ? \`stdout:\\n\${result.stdout}\` : "stdout:",
    result.stderr ? \`stderr:\\n\${result.stderr}\` : "stderr:",
  ].join("\\n\\n"),
);

if (result.error || result.status !== 0) {
  block(
    [
      "Rev could not complete the automatic goal check.",
      "Inspect .rev/hook-output.txt, fix the issue, then run rev check again before marking the goal done.",
    ].join("\\n"),
  );
}

const review = readJson(join(root, ".rev", "review.json"));
const recovery = readText(join(root, ".rev", "recovery-prompt.md")).trim();
const report = readText(join(root, ".rev", "report.md")).trim();

if (review?.goal_satisfied === true && String(review?.verdict || "").toLowerCase() === "approve") {
  allow("Rev approved the run.");
}

block(
  recovery ||
    [
      "Rev did not approve this run.",
      "Use .rev/report.md as the evidence packet and continue the same goal until Rev reports Goal satisfied: yes.",
      report ? \`\\nLatest Rev report excerpt:\\n\${report.slice(0, 1200)}\` : "",
    ].join("\\n"),
);

function readHookInput() {
  try {
    const raw = readFileSync(0, "utf8").trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function gitRoot(cwd) {
  const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function looksLikeCompletion(message) {
  if (typeof message !== "string" || !message.trim()) return false;
  return /\\b(done|complete|completed|implemented|fixed|finished|ready|shipped|pushed|goal achieved|verified|passes)\\b/i.test(message);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return "";
  }
}

function allow(message) {
  process.stdout.write(
    JSON.stringify({
      continue: true,
      systemMessage: message,
      suppressOutput: true,
    }),
  );
  process.exit(0);
}

function block(reason) {
  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason,
    }),
  );
  process.exit(0);
}
`;

const hooksJson = {
  hooks: {
    Stop: [
      {
        hooks: [
          {
            type: "command",
            command: 'node "$(git rev-parse --show-toplevel)/.codex/hooks/rev-stop.mjs"',
            timeout: 600,
            statusMessage: "Rev is checking whether the goal is actually done",
          },
        ],
      },
    ],
  },
};

export async function init(cwd: string): Promise<string> {
  const created: string[] = [];
  const kept: string[] = [];

  await ensureDir(cwd, join(cwd, ".rev"), created);
  await ensureDir(cwd, join(cwd, ".codex"), created);
  await ensureDir(cwd, join(cwd, ".codex", "hooks"), created);

  await writeIfMissing(cwd, join(cwd, ".rev", "goal.md"), "# Goal\n\nDescribe the goal for the next autonomous run.\n", created, kept);
  await writeIfMissing(
    cwd,
    join(cwd, ".rev", "config.json"),
    `${JSON.stringify({ reviewCommand: "codex exec -s read-only", reviewMode: "goal", maxReviewBytes: 200000, memoryEntries: 5 }, null, 2)}\n`,
    created,
    kept,
  );
  await installHooksJson(cwd, created, kept);
  await writeIfMissing(cwd, join(cwd, ".codex", "hooks", "rev-stop.mjs"), hookScript, created, kept, 0o755);

  return formatInitResult(created, kept);
}

async function ensureDir(cwd: string, path: string, created: string[]) {
  if (existsSync(path)) return;
  await mkdir(path, { recursive: true });
  created.push(relative(cwd, path));
}

async function writeIfMissing(cwd: string, path: string, content: string, created: string[], kept: string[], mode?: number) {
  if (existsSync(path)) {
    kept.push(relative(cwd, path));
    return;
  }
  await writeFile(path, content, { encoding: "utf8", mode });
  created.push(relative(cwd, path));
}

async function installHooksJson(cwd: string, created: string[], kept: string[]) {
  const path = join(cwd, ".codex", "hooks.json");
  if (!existsSync(path)) {
    await writeFile(path, `${JSON.stringify(hooksJson, null, 2)}\n`, "utf8");
    created.push(relative(cwd, path));
    return;
  }

  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw);
  parsed.hooks ??= {};
  parsed.hooks.Stop = Array.isArray(parsed.hooks.Stop) ? parsed.hooks.Stop : [];

  const hasRevHook = JSON.stringify(parsed.hooks.Stop).includes("rev-stop.mjs");
  if (hasRevHook) {
    kept.push(relative(cwd, path));
    return;
  }

  parsed.hooks.Stop.push(hooksJson.hooks.Stop[0]);
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  created.push(`${relative(cwd, path)} Rev Stop hook`);
}

function formatInitResult(created: string[], kept: string[]): string {
  const lines = ["Initialized Rev", ""];
  if (created.length) lines.push("Created:", ...created.map((path) => `  ${path}`), "");
  if (kept.length) lines.push("Already present:", ...kept.map((path) => `  ${path}`), "");
  lines.push("Next:", "  1. Open Codex in this repository", "  2. Run /hooks", "  3. Trust the Rev Stop hook", "  4. Start /goal");
  return lines.join("\n");
}

function relative(cwd: string, path: string): string {
  const marker = `${cwd}/`;
  return path.startsWith(marker) ? path.slice(marker.length) : path;
}
