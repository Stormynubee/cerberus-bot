#!/usr/bin/env node
/**
 * Hybrid hosting: Render primary, laptop backup.
 *
 * Discord allows only ONE gateway session per token — never run both at once.
 * This supervisor:
 *   - pings Render /health
 *   - if Render is healthy + discordReady → stop any local bot
 *   - if Render is down / not ready for several checks → start local bot
 *
 * Usage:
 *   npm run build
 *   npm run laptop:failover
 *
 * Prefer `npm run laptop:keepalive` when you only want to keep Render awake.
 */
import "dotenv/config";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const raw =
  process.env.KEEP_ALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://greekbot.onrender.com";
const healthUrl = `${raw.replace(/\/$/, "")}/health`;
const checkMs = Number(process.env.FAILOVER_CHECK_MS || 30_000);
const failBeforeStart = Number(process.env.FAILOVER_FAILS || 3);

/** @type {import('node:child_process').ChildProcess | null} */
let localBot = null;
let consecutiveFails = 0;

async function checkRender() {
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const body = await res.json();
    if (!body.discordReady) return { ok: false, reason: "discordReady=false" };
    return { ok: true, reason: `uptime=${body.uptime}` };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

function startLocal() {
  if (localBot) return;
  console.log("[laptop-failover] Render unhealthy → starting LOCAL bot");
  localBot = spawn(process.execPath, ["dist/index.js"], {
    cwd: root,
    env: {
      ...process.env,
      // Avoid colliding with Render's public keep-alive URL loop if unset locally.
      HOSTING_ROLE: "laptop-failover",
    },
    stdio: "inherit",
  });
  localBot.on("exit", (code, signal) => {
    console.warn(`[laptop-failover] local bot exited code=${code} signal=${signal}`);
    localBot = null;
  });
}

function stopLocal(reason) {
  if (!localBot) return;
  console.log(`[laptop-failover] ${reason} → stopping LOCAL bot`);
  const child = localBot;
  localBot = null;
  try {
    child.kill("SIGTERM");
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 5000).unref();
}

async function tick() {
  const status = await checkRender();
  if (status.ok) {
    consecutiveFails = 0;
    console.log(`[laptop-failover] Render OK (${status.reason})`);
    stopLocal("Render healthy again");
    return;
  }

  consecutiveFails += 1;
  console.warn(
    `[laptop-failover] Render NOT ready (${status.reason}) fails=${consecutiveFails}/${failBeforeStart}`,
  );
  if (consecutiveFails >= failBeforeStart) startLocal();
}

console.log(`[laptop-failover] watching ${healthUrl}`);
console.log("[laptop-failover] Local bot starts only after consecutive failures.");
await tick();
setInterval(() => {
  void tick();
}, checkMs);

function shutdown() {
  stopLocal("supervisor shutting down");
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
