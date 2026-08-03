#!/usr/bin/env node
// Runs all single-build `verify-*.mjs` checks sequentially against the active Obsidian target.
// `verify-release-differential.mjs` is the excluded multi-build orchestrator.

import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const self = path.basename(fileURLToPath(import.meta.url));
const multiBuildOrchestrator = "verify-release-differential.mjs";
const scripts = readdirSync(here)
  .filter((f) => f.startsWith("verify-")
    && f.endsWith(".mjs")
    && f !== self
    && f !== multiBuildOrchestrator)
  .sort();

const env = { ...process.env, CDP_PORT: process.env.CDP_PORT ?? "9223", CDP_TARGET: process.env.CDP_TARGET ?? "vault-image-toolbar" };

console.log(`Running ${scripts.length} CDP/optical checks against Obsidian (CDP_PORT=${env.CDP_PORT})\n`);

// blocking inter-script settle so back-to-back runs don't measure a still-busy Obsidian
const settle = (ms) => spawnSync("node", ["-e", `setTimeout(()=>{}, ${ms})`]);

const results = [];
for (const f of scripts) {
  settle(1200);
  process.stdout.write(`▶ ${f} … `);
  const r = spawnSync("node", [path.join(here, f)], { env, encoding: "utf8" });
  const out = (r.stdout || "") + (r.stderr || "");
  const tally = (out.match(/(\d+)\/(\d+) passed/g) || []).pop() || "";
  const ok = r.status === 0;
  results.push({ f, ok, code: r.status, tally });
  console.log(`${ok ? "OK" : "FAIL"} ${tally ? "(" + tally + ")" : ""}${ok ? "" : ` [exit ${r.status}]`}`);
  if (!ok) {
    // surface the failing lines for quick triage
    for (const line of out.split("\n").filter((l) => /^FAIL\b|FATAL/.test(l))) console.log(`    ${line}`);
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} scripts passed`);
if (failed.length) {
  console.log("Failing: " + failed.map((r) => r.f).join(", "));
  process.exit(failed.length);
}
console.log("ALL OPTICAL/CDP CHECKS GREEN");
