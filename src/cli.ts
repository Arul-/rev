import { loadConfig } from "./config";
import { ensureRevDir } from "./fs";
import { check } from "./check";
import { serve } from "./server";
import { formatSearchResults, searchDecisionPaths } from "./search";

export async function main(argv: string[]): Promise<void> {
  const cwd = process.cwd();
  const [command = "help", ...rest] = argv;

  try {
    if (command === "init") {
      await ensureRevDir(cwd);
      console.log("Initialized .rev/");
      return;
    }

    if (command === "check") {
      const initialGoal = rest.length ? rest.join(" ") : undefined;
      process.exitCode = await check(cwd, initialGoal);
      return;
    }

    if (command === "serve") {
      await ensureRevDir(cwd);
      const backgroundChild = rest.includes("--background-child");
      const config = await loadConfig(cwd);
      const { url } = await serve(cwd, config);
      console.log(`Rev inspector: ${url}`);
      if (backgroundChild) await new Promise(() => {});
      return;
    }

    if (command === "search") {
      const query = rest.join(" ").trim();
      if (!query) throw new Error("Usage: ./bin/rev search <query>");
      const results = await searchDecisionPaths(cwd, query);
      console.log(formatSearchResults(results));
      return;
    }

    if (command === "report") {
      console.log(await Bun.file(".rev/report.md").text());
      return;
    }

    printHelp();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

function printHelp(): void {
  console.log(`Usage:
  ./bin/rev init
  ./bin/rev check ["goal"]
  ./bin/rev report
  ./bin/rev serve
  ./bin/rev search <query>`);
}
