import { join } from "node:path";
import { pickTestCommand } from "./config";
import { writeText } from "./fs";
import { runCommand, type CommandResult } from "./shell";

export type TestRun = {
  command?: string;
  exitCode?: number;
  stdout: string;
  stderr: string;
  skipped: boolean;
  skipReason?: string;
};

export async function runTests(cwd: string, configured?: string): Promise<TestRun> {
  const picked = await pickTestCommand(cwd, configured);
  if (!picked.command) {
    const skipped: TestRun = {
      stdout: "",
      stderr: "",
      skipped: true,
      skipReason: picked.reason ?? "No test command configured.",
    };
    await writeTestOutput(cwd, skipped);
    return skipped;
  }

  const result = await runCommand(picked.command, cwd);
  const testRun: TestRun = {
    command: picked.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    skipped: false,
  };
  await writeTestOutput(cwd, testRun);
  return testRun;
}

export async function writeTestOutput(cwd: string, testRun: TestRun): Promise<void> {
  const text = testRun.skipped
    ? `Command: skipped\nReason: ${testRun.skipReason}\n`
    : formatCommandResult({
        command: testRun.command ?? "",
        exitCode: testRun.exitCode ?? 0,
        stdout: testRun.stdout,
        stderr: testRun.stderr,
      });
  await writeText(join(cwd, ".rev", "test-output.txt"), text);
}

function formatCommandResult(result: CommandResult): string {
  return [
    `Command: ${result.command}`,
    `Exit code: ${result.exitCode}`,
    "",
    "STDOUT:",
    result.stdout.trimEnd(),
    "",
    "STDERR:",
    result.stderr.trimEnd(),
    "",
  ].join("\n");
}
