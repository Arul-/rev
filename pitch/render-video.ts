#!/usr/bin/env bun

import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const deckPath = join(root, "pitch", "rev-ralphthon-slides.html");
const outputs = join(root, "outputs");
const framesDir = join(outputs, "video-frames");
const outputVideo = join(outputs, "rev-demo.mp4");
const narrationText = join(outputs, "rev-demo-narration.txt");
const narrationAiff = join(outputs, "rev-demo-narration.aiff");
const narrationM4a = join(outputs, "rev-demo-narration.m4a");

const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const slideCount = 8;
const width = 1920;
const height = 1080;
const fps = 30;

const narration = [
  "Rev is a second opinion harness for Codex goal runs.",
  "The problem is simple. Autonomous coding creates a trust gap when the agent says done.",
  "Rev records the decision path: intent, observation, decision, and recovery.",
  "The architecture is intentionally small: goal, diff, tests, validators, reviewer, and artifacts.",
  "The inspector makes drift visible as a local evaluation console.",
  "It fits the hackathon as a harness, a skill pattern, and an evaluation loop.",
  "The demo moment is Rev catching a drifted run and handing back the exact recovery prompt.",
  "The loop is now built and dogfooded: tests pass, validators pass, and Rev approved its own run.",
].join(" ");

async function main() {
  await mkdir(outputs, { recursive: true });
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });

  if (!existsSync(chrome)) {
    throw new Error(`Google Chrome was not found at ${chrome}`);
  }
  await requireCommand("ffmpeg");
  await requireCommand("ffprobe");

  for (let slide = 1; slide <= slideCount; slide += 1) {
    const out = join(framesDir, `slide-${String(slide).padStart(2, "0")}.png`);
    await run(chrome, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${width},${height}`,
      `--screenshot=${out}`,
      `file://${deckPath}#slide-${slide}`,
    ]);
  }

  await writeFile(narrationText, `${narration}\n`, "utf8");
  let audioDuration = 40;
  if (await commandExists("say")) {
    await run("say", ["-v", "Samantha", "-f", narrationText, "-o", narrationAiff]);
    await run("ffmpeg", ["-y", "-i", narrationAiff, "-c:a", "aac", "-b:a", "160k", narrationM4a]);
    audioDuration = Number((await runCapture("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      narrationM4a,
    ])).trim()) || 40;
  }

  const durationPerSlide = Math.max(4, Math.ceil(((audioDuration + 2) / slideCount) * 100) / 100);
  const concatPath = join(framesDir, "concat.txt");
  const concat = Array.from({ length: slideCount }, (_, i) => {
    const frame = join(framesDir, `slide-${String(i + 1).padStart(2, "0")}.png`);
    return `file '${frame.replaceAll("'", "'\\''")}'\nduration ${durationPerSlide}`;
  }).join("\n") + `\nfile '${join(framesDir, `slide-${String(slideCount).padStart(2, "0")}.png`).replaceAll("'", "'\\''")}'\n`;
  await writeFile(concatPath, concat, "utf8");

  const videoOnly = join(framesDir, "rev-demo-video-only.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-vf",
    `fps=${fps},format=yuv420p`,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "18",
    videoOnly,
  ]);

  if (existsSync(narrationM4a)) {
    await run("ffmpeg", [
      "-y",
      "-i",
      videoOnly,
      "-i",
      narrationM4a,
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-shortest",
      "-movflags",
      "+faststart",
      outputVideo,
    ]);
  } else {
    await run("ffmpeg", ["-y", "-i", videoOnly, "-movflags", "+faststart", outputVideo]);
  }

  console.log(`Wrote ${outputVideo}`);
}

async function commandExists(command: string): Promise<boolean> {
  const proc = Bun.spawn(["/bin/sh", "-lc", `command -v ${command}`], { stdout: "ignore", stderr: "ignore" });
  return await proc.exited === 0;
}

async function requireCommand(command: string) {
  if (!(await commandExists(command))) {
    throw new Error(`${command} is required to render pitch/rev-ralphthon-slides.html to video`);
  }
}

async function run(command: string, args: string[]) {
  const proc = Bun.spawn([command, ...args], { cwd: root, stdout: "inherit", stderr: "inherit" });
  const exit = await proc.exited;
  if (exit !== 0) throw new Error(`${command} ${args.join(" ")} exited ${exit}`);
}

async function runCapture(command: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([command, ...args], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exit !== 0) throw new Error(`${command} ${args.join(" ")} exited ${exit}\n${stderr}`);
  return stdout;
}

await main();
