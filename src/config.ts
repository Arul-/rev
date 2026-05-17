import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export type RevConfig = {
  testCommand?: string;
  reviewCommand: string;
  reviewMode: "goal" | "adversarial" | "rescue";
  maxReviewBytes: number;
  memoryEntries: number;
  port: number;
};

export const defaultConfig: RevConfig = {
  testCommand: undefined,
  reviewCommand: "codex exec -s read-only",
  reviewMode: "goal",
  maxReviewBytes: 200000,
  memoryEntries: 5,
  port: 37887,
};

export async function loadConfig(cwd: string): Promise<RevConfig> {
  const configPath = join(cwd, ".rev", "config.json");
  if (!existsSync(configPath)) return { ...defaultConfig };

  const parsed = JSON.parse(await readFile(configPath, "utf8"));
  return {
    ...defaultConfig,
    ...parsed,
    maxReviewBytes: Number(parsed.maxReviewBytes ?? defaultConfig.maxReviewBytes),
    memoryEntries: Number(parsed.memoryEntries ?? defaultConfig.memoryEntries),
    port: Number(parsed.port ?? defaultConfig.port),
  };
}

export async function pickTestCommand(cwd: string, configured?: string): Promise<{ command?: string; reason?: string }> {
  if (configured && configured.trim()) return { command: configured.trim() };

  if (existsSync(join(cwd, "bun.lock")) || existsSync(join(cwd, "bun.lockb"))) return { command: "bun test" };
  if (existsSync(join(cwd, "package.json"))) return { command: "npm test" };
  if (existsSync(join(cwd, "pnpm-lock.yaml"))) return { command: "pnpm test" };

  return { reason: "No package file or configured test command was found." };
}
