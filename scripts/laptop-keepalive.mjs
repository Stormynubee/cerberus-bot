#!/usr/bin/env node
/**
 * Laptop keep-alive for Render Free.
 *
 * Discord allows only ONE live gateway per bot token.
 * Do NOT also run `npm start` with the production token while Render is hosting.
 *
 * This script only HTTP-pings Render so it does not sleep.
 * Leave it running on your laptop while Render hosts GreekBot.
 *
 * Usage: npm run laptop:keepalive
 */
import "dotenv/config";

const raw =
  process.env.KEEP_ALIVE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "https://greekbot.onrender.com";
const url = `${raw.replace(/\/$/, "")}/health`;
const intervalMs = Number(process.env.KEEP_ALIVE_INTERVAL_MS || 2 * 60 * 1000);

async function tick() {
  const started = Date.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    const text = await res.text();
    let discordReady = "?";
    try {
      discordReady = String(JSON.parse(text).discordReady);
    } catch {
      /* ignore */
    }
    console.log(
      `[laptop-keepalive] ${new Date().toISOString()} ${res.status} discordReady=${discordReady} ${Date.now() - started}ms`,
    );
  } catch (err) {
    console.warn(
      `[laptop-keepalive] ${new Date().toISOString()} FAIL ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

console.log(`[laptop-keepalive] pinging ${url} every ${Math.round(intervalMs / 1000)}s`);
console.log("[laptop-keepalive] Keep this window open. Do not run npm start with the production token.");
await tick();
setInterval(() => {
  void tick();
}, intervalMs);
