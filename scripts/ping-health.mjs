#!/usr/bin/env node
/**
 * External keep-alive for Render Free.
 * Hit the public /health URL so the service does not spin down.
 * Schedule: every 5 minutes (Render cron or cron-job.org).
 */
const url = (process.env.KEEP_ALIVE_URL || "https://greekbot.onrender.com/health").replace(
  /\/$/,
  "",
);

const res = await fetch(url.includes("/health") ? url : `${url}/health`);
const text = await res.text();
console.log(`[keepalive] ${res.status} ${text.slice(0, 200)}`);
if (!res.ok) process.exit(1);
