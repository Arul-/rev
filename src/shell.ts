export type CommandResult = {
  command: string;
  exitCode: number;
  stdout: string;
  stderr: string;
};

export async function runCommand(command: string, cwd: string, input?: string): Promise<CommandResult> {
  const proc = Bun.spawn(["/bin/sh", "-lc", command], {
    cwd,
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (input !== undefined && proc.stdin) {
    proc.stdin.write(input);
    proc.stdin.end();
  }

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { command, exitCode, stdout, stderr };
}
