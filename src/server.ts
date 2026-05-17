import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { RevConfig } from "./config";
import { readDecisionPaths } from "./search";

export async function serve(cwd: string, config: RevConfig): Promise<{ server: Server; url: string }> {
  let port = config.port;
  while (port < config.port + 20) {
    try {
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port,
        async fetch(req) {
          const url = new URL(req.url);
          if (url.pathname === "/api/state") {
            return Response.json(await readState(cwd));
          }
          if (url.pathname.startsWith("/artifact/")) {
            const name = url.pathname.replace("/artifact/", "");
            return artifactResponse(cwd, name);
          }
          return new Response(renderHtml(), { headers: { "content-type": "text/html; charset=utf-8" } });
        },
      });
      return { server, url: `http://127.0.0.1:${port}` };
    } catch (error) {
      if (String(error).includes("EADDRINUSE")) {
        port += 1;
        continue;
      }
      throw error;
    }
  }
  throw new Error(`No available port found starting at ${config.port}.`);
}

export async function tryPingInspector(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(250) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureInspector(cwd: string, config: RevConfig): Promise<string | undefined> {
  const url = `http://127.0.0.1:${config.port}`;
  if (await tryPingInspector(url)) return url;
  try {
    const proc = Bun.spawn([process.execPath, "bin/rev", "serve", "--background-child"], {
      cwd,
      stdout: "ignore",
      stderr: "ignore",
      stdin: "ignore",
    });
    proc.unref();
    return url;
  } catch {
    return undefined;
  }
}

async function readState(cwd: string) {
  const [goal, review, validators, report, recovery, memory, testOutput, decisions] = await Promise.all([
    readOptional(join(cwd, ".rev", "goal.md")),
    readJsonOptional(join(cwd, ".rev", "review.json")),
    readJsonOptional(join(cwd, ".rev", "validators.json")),
    readOptional(join(cwd, ".rev", "report.md")),
    readOptional(join(cwd, ".rev", "recovery-prompt.md")),
    readJsonlOptional(join(cwd, ".rev", "memory.jsonl")),
    readOptional(join(cwd, ".rev", "test-output.txt")),
    readDecisionPaths(cwd),
  ]);
  return {
    goal,
    review,
    validators,
    report,
    recovery,
    memory,
    testOutput,
    decisions: decisions.paths,
    warnings: decisions.warnings,
    updatedAt: new Date().toISOString(),
  };
}

async function artifactResponse(cwd: string, name: string): Promise<Response> {
  const allowed = new Set(["report.md", "diff.patch", "test-output.txt", "recovery-prompt.md"]);
  if (!allowed.has(name)) return new Response("Not found", { status: 404 });
  const text = await readOptional(join(cwd, ".rev", name));
  return new Response(text || "Not found", { headers: { "content-type": "text/plain; charset=utf-8" } });
}

async function readOptional(path: string): Promise<string> {
  if (!existsSync(path)) return "";
  return await readFile(path, "utf8");
}

async function readJsonOptional(path: string): Promise<unknown> {
  const text = await readOptional(path);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readJsonlOptional(path: string): Promise<unknown[]> {
  const text = await readOptional(path);
  if (!text.trim()) return [];
  return text.split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
}

function renderHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Rev Inspector</title>
  <style>
    :root { color-scheme: dark; --bg:#0b0d0e; --panel:#14181a; --line:#263034; --text:#e7ece8; --muted:#8d999d; --green:#7ee787; --amber:#f2b94b; --red:#ff6b6b; --cyan:#55d7ff; }
    * { box-sizing: border-box; }
    body { margin:0; font:14px/1.45 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:var(--bg); color:var(--text); letter-spacing:0; }
    header { padding:16px 20px 10px; border-bottom:1px solid var(--line); background:#0f1213; position:sticky; top:0; z-index:5; }
    h1 { margin:0 0 12px; font-size:18px; font-weight:700; }
    button { background:#1e2528; color:var(--text); border:1px solid #344045; border-radius:6px; padding:7px 9px; cursor:pointer; }
    button:focus { outline:2px solid var(--cyan); outline-offset:2px; }
    .strip { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:8px; }
    .metric { border:1px solid var(--line); border-radius:8px; padding:10px; background:#15191b; min-height:74px; }
    .metric span { display:block; color:var(--muted); font-size:12px; }
    .metric strong { display:block; margin-top:4px; font-size:16px; }
    .ok { color:var(--green); } .warn { color:var(--amber); } .bad { color:var(--red); } .trace { color:var(--cyan); }
    main { display:grid; grid-template-columns:280px minmax(360px,1fr) 320px; gap:12px; padding:12px; }
    section { border:1px solid var(--line); border-radius:8px; background:var(--panel); min-width:0; }
    section h2 { margin:0; padding:12px 12px 8px; font-size:13px; text-transform:uppercase; color:#b8c4c7; border-bottom:1px solid var(--line); }
    .body { padding:12px; }
    pre { white-space:pre-wrap; word-break:break-word; margin:0; color:#d6dcde; font:12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; }
    .rail { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:1px; border:1px solid #304149; border-radius:8px; overflow:hidden; margin-bottom:10px; background:#304149; }
    .cell { background:#101516; padding:12px; min-height:126px; }
    .cell b { display:block; color:var(--cyan); margin-bottom:6px; }
    .actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .list { display:grid; gap:8px; }
    .item { border:1px solid #2a3438; border-radius:6px; padding:8px; background:#101516; }
    input { width:100%; margin-bottom:10px; background:#0f1314; color:var(--text); border:1px solid #344045; border-radius:6px; padding:9px; }
    a { color:var(--cyan); }
    footer { padding:0 12px 12px; display:grid; grid-template-columns:1fr 1fr; gap:12px; }
    @media (max-width: 900px) { .strip, main, footer { grid-template-columns:1fr; } main { padding-bottom:84px; } .rail { grid-template-columns:1fr; } .sticky { position:fixed; bottom:0; left:0; right:0; border-radius:0; } }
  </style>
</head>
<body>
  <header>
    <h1>Rev Inspector</h1>
    <div class="strip" id="strip"></div>
  </header>
  <main>
    <section><h2>Current Run</h2><div class="body" id="current"></div></section>
    <section><h2>Decision Path Rail</h2><div class="body"><input id="search" placeholder="Search decision paths" /><div id="rails"></div></div></section>
    <section class="sticky"><h2>Recovery</h2><div class="body" id="recovery"></div></section>
  </main>
  <footer>
    <section><h2>Validators</h2><div class="body list" id="validators"></div></section>
    <section><h2>Run History</h2><div class="body list" id="history"></div></section>
  </footer>
  <script>
    let state = null, paused = false;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? "").replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
    const cls = (value) => value === "approve" || value === true || value === "pass" ? "ok" : value === "fail" || value === false ? "bad" : "warn";
    async function copyText(text) { await navigator.clipboard.writeText(text || ""); }
    function metric(label, value, hint) { return '<div class="metric"><span>'+esc(label)+'</span><strong class="'+cls(value)+'">'+esc(value)+'</strong><span>'+esc(hint || "")+'</span></div>'; }
    function render() {
      const review = state.review || {};
      const drift = review.drift || {};
      const hall = review.hallucination || {};
      const tests = /Exit code: 0/.test(state.testOutput || "") ? "pass" : state.testOutput ? "warn" : "waiting";
      $("strip").innerHTML = [
        metric("Goal Match", review.goal_satisfied === true ? "yes" : review.goal_satisfied === false ? "no" : "waiting", review.goal_interpretation || "No review yet"),
        metric("Drift", drift.level || "waiting", drift.evidence || "No drift verdict yet"),
        metric("Tests", tests, (state.testOutput || "").split("\\n").slice(0,2).join(" ")),
        metric("Recovery", state.recovery?.trim() ? "available" : "none", hall.status ? "Hallucination: " + hall.status : "")
      ].join("");
      $("current").innerHTML = '<pre>'+esc((state.goal || "No goal found").slice(0,1200))+'</pre><div class="actions"><a href="/artifact/report.md">Open report</a><a href="/artifact/diff.patch">Open diff</a><a href="/artifact/test-output.txt">Open tests</a><button onclick="paused=!paused; this.textContent=paused ? \\'Resume refresh\\' : \\'Pause refresh\\'">Pause refresh</button></div>';
      const q = $("search").value.toLowerCase();
      const paths = (state.decisions || []).filter(p => JSON.stringify(p).toLowerCase().includes(q));
      $("rails").innerHTML = paths.length ? paths.map((p,i) => '<div class="rail"><div class="cell"><b>Intent</b>'+esc(p.intent)+'</div><div class="cell"><b>Observation</b>'+esc(p.observation)+'</div><div class="cell"><b>Decision</b>'+esc(p.decision)+'</div><div class="cell"><b>Recovery</b>'+esc(p.recovery)+'<div class="actions"><button onclick="copyText(state.decisions['+i+'].recovery)">Copy Recovery</button><button onclick="copyText(state.decisions['+i+'].copy_markdown)">Copy Path</button><button onclick="copyText(state.decisions['+i+'].observation)">Copy Issue</button></div></div></div>').join("") : '<div class="item">Waiting for first Rev check</div>';
      $("recovery").innerHTML = '<pre>'+esc(state.recovery?.trim() || "No recovery prompt needed yet.")+'</pre><div class="actions"><button onclick="copyText(state.recovery)">Copy Recovery</button><button onclick="copyText((state.decisions||[])[0]?.copy_markdown)">Copy Path</button></div>';
      $("validators").innerHTML = ((state.validators && state.validators.checks) || []).map(v => '<div class="item"><b class="'+cls(v.status)+'">'+esc(v.status.toUpperCase())+'</b> '+esc(v.name)+'<br><span>'+esc(v.message)+'</span></div>').join("") || '<div class="item">No validators yet.</div>';
      $("history").innerHTML = (state.memory || []).slice(-8).reverse().map(m => '<div class="item"><b class="'+cls(m.verdict)+'">'+esc(m.verdict)+'</b> '+esc(m.summary)+'<br><span>'+esc(m.timestamp)+'</span></div>').join("") || '<div class="item">No run history yet.</div>';
    }
    async function tick() { if (paused) return; state = await fetch("/api/state").then(r => r.json()); render(); }
    $("search").addEventListener("input", () => state && render());
    tick(); setInterval(tick, 1500);
  </script>
</body>
</html>`;
}
