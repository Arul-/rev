import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { runCommand } from "./shell";
import { writeText } from "./fs";

export type GitEvidence = {
  insideGitRepo: boolean;
  root?: string;
  status: string;
  stagedDiff: string;
  unstagedDiff: string;
  combinedDiff: string;
  untrackedFiles: string[];
};

const pathspecExcludes = " -- . ':(exclude).rev/**'";

export async function getGitRoot(cwd: string): Promise<string | undefined> {
  const result = await runCommand("git rev-parse --show-toplevel", cwd);
  return result.exitCode === 0 ? result.stdout.trim() : undefined;
}

export async function captureGitEvidence(cwd: string): Promise<GitEvidence> {
  const root = await getGitRoot(cwd);
  if (!root) {
    return {
      insideGitRepo: false,
      status: "",
      stagedDiff: "",
      unstagedDiff: "",
      combinedDiff: "",
      untrackedFiles: [],
    };
  }

  const [statusResult, stagedResult, unstagedResult, combinedResult] = await Promise.all([
    runCommand("git status --short --untracked-files=all -- ':!.rev/**'", cwd),
    runCommand(`git diff --cached${pathspecExcludes}`, cwd),
    runCommand(`git diff${pathspecExcludes}`, cwd),
    runCommand(`git diff HEAD${pathspecExcludes}`, cwd),
  ]);

  const untrackedFiles = statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("?? "))
    .map((line) => line.slice(3))
    .filter((file) => !file.startsWith(".rev/") && isLikelyTextFile(file));

  const untrackedPatch = await buildUntrackedPatch(cwd, untrackedFiles);
  const combinedDiff = [combinedResult.stdout.trimEnd(), untrackedPatch.trimEnd()].filter(Boolean).join("\n\n");

  await writeText(join(cwd, ".rev", "status.txt"), statusResult.stdout);
  await writeText(join(cwd, ".rev", "staged.diff.patch"), stagedResult.stdout);
  await writeText(join(cwd, ".rev", "unstaged.diff.patch"), unstagedResult.stdout);
  await writeText(join(cwd, ".rev", "diff.patch"), `${combinedDiff}${combinedDiff ? "\n" : ""}`);
  await writeText(join(cwd, ".rev", "untracked-files.txt"), `${untrackedFiles.join("\n")}${untrackedFiles.length ? "\n" : ""}`);

  return {
    insideGitRepo: true,
    root,
    status: statusResult.stdout,
    stagedDiff: stagedResult.stdout,
    unstagedDiff: unstagedResult.stdout,
    combinedDiff,
    untrackedFiles,
  };
}

function isLikelyTextFile(file: string): boolean {
  return !/\.(png|jpe?g|gif|webp|ico|pdf|zip|tar|gz|mp4|mov|mp3|wav|woff2?)$/i.test(file);
}

async function buildUntrackedPatch(cwd: string, files: string[]): Promise<string> {
  const sections: string[] = [];
  for (const file of files) {
    try {
      const content = await readFile(join(cwd, file), "utf8");
      if (content.includes("\u0000")) continue;
      sections.push([
        `diff --git a/${file} b/${file}`,
        "new file mode 100644",
        "index 0000000..0000000",
        "--- /dev/null",
        `+++ b/${file}`,
        ...content.split(/\r?\n/).map((line) => `+${line}`),
      ].join("\n"));
    } catch {
      // Ignore files that disappear during capture or cannot be read as UTF-8.
    }
  }
  return sections.join("\n\n");
}
