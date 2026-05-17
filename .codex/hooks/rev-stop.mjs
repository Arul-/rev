#!/usr/bin/env node
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
    `timestamp=${new Date().toISOString()}`,
    `exit=${result.status ?? "signal"}`,
    result.stdout ? `stdout:\n${result.stdout}` : "stdout:",
    result.stderr ? `stderr:\n${result.stderr}` : "stderr:",
  ].join("\n\n"),
);

if (result.error || result.status !== 0) {
  block(
    [
      "Rev could not complete the automatic goal check.",
      "Inspect .rev/hook-output.txt, fix the issue, then run rev check again before marking the goal done.",
    ].join("\n"),
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
      report ? `\nLatest Rev report excerpt:\n${report.slice(0, 1200)}` : "",
    ].join("\n"),
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
  return /\b(done|complete|completed|implemented|fixed|finished|ready|shipped|pushed|goal achieved|verified|passes)\b/i.test(message);
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
