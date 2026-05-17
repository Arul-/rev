import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DecisionPath } from "./reviewer";

export async function readDecisionPaths(cwd: string): Promise<{ paths: DecisionPath[]; warnings: string[] }> {
  const file = join(cwd, ".rev", "decisions.jsonl");
  if (!existsSync(file)) return { paths: [], warnings: [] };
  const lines = (await readFile(file, "utf8")).split(/\r?\n/).filter(Boolean);
  const paths: DecisionPath[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    try {
      paths.push(JSON.parse(line));
    } catch {
      warnings.push(`Skipped malformed decisions.jsonl line ${index + 1}.`);
    }
  });

  return { paths, warnings };
}

export async function searchDecisionPaths(cwd: string, query: string): Promise<DecisionPath[]> {
  const { paths } = await readDecisionPaths(cwd);
  const needle = query.toLowerCase();
  return paths.filter((path) => JSON.stringify(path).toLowerCase().includes(needle));
}

export function formatSearchResults(paths: DecisionPath[]): string {
  if (!paths.length) return "No matching decision paths found.\n";
  return paths
    .map((path, index) => {
      return [
        `#${index + 1} ${path.kind} [${path.tags?.join(", ") ?? ""}]`,
        path.copy_markdown,
        `Evidence: ${path.evidence}`,
      ].join("\n");
    })
    .join("\n\n");
}
