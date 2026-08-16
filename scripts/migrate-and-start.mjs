#!/usr/bin/env node
/**
 * Production start: apply migrations, recover known failed migration, then boot.
 * Never block Discord forever on a stuck migrate — log loudly and still start
 * so slash commands don't show "application did not respond".
 */
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  console.log(`[boot] $ ${cmd} ${args.join(" ")}`);
  return spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
}

function migrateDeploy() {
  return run("npx", ["prisma", "migrate", "deploy"]);
}

if (process.env.HOSTING_ROLE === "paused-laptop-primary") {
  console.log("[boot] HOSTING_ROLE=paused-laptop-primary — skip migrate, idle without Discord");
  const idle = run("node", ["dist/index.js"]);
  process.exit(idle.status ?? 1);
}

let result = migrateDeploy();
if (result.status !== 0) {
  console.warn("[boot] migrate deploy failed — trying to clear known failed migration…");
  // BOM-corrupted migration that failed on first apply (P3018 / P3009).
  run("npx", ["prisma", "migrate", "resolve", "--rolled-back", "20260811144500_hg_default_entry"]);
  result = migrateDeploy();
}

if (result.status !== 0) {
  console.error(
    "[boot] WARNING: migrations still failing. Starting bot anyway so Discord stays online.",
  );
  console.error("[boot] Fix DB with: npx prisma migrate resolve / migrate deploy");
}

const bot = run("node", ["dist/index.js"]);
process.exit(bot.status ?? 1);
