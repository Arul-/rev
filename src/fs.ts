import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export const revDirName = ".rev";

export async function ensureRevDir(cwd: string): Promise<string> {
  const revDir = join(cwd, revDirName);
  await mkdir(revDir, { recursive: true });
  return revDir;
}

export async function readText(path: string): Promise<string> {
  return await readFile(path, "utf8");
}

export async function writeText(path: string, text: string): Promise<void> {
  await writeFile(path, text, "utf8");
}

export async function loadGoal(cwd: string, initialGoal?: string): Promise<string> {
  const revDir = await ensureRevDir(cwd);
  const goalPath = join(revDir, "goal.md");

  if (!existsSync(goalPath) && initialGoal?.trim()) {
    await writeText(goalPath, `# Goal\n\n${initialGoal.trim()}\n`);
  }

  if (!existsSync(goalPath)) {
    throw new Error("Missing .rev/goal.md. Create it or run ./bin/rev check \"your goal\".");
  }

  const goal = (await readText(goalPath)).trim();
  if (!goal) throw new Error(".rev/goal.md exists but is empty.");
  return goal;
}

export function stripPrivateBlocks(input: string): string {
  return input.replace(/<private>[\s\S]*?<\/private>/gi, "[private]");
}
