import http from "node:http";

let discordReady = false;

export function setDiscordReady(ready: boolean): void {
  discordReady = ready;
}

/** Render web services require binding to PORT; Discord bots do not otherwise serve HTTP. */
export function startHealthServer(): void {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return;

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      const body = {
        ok: true,
        service: "greekbot",
        uptime: Math.floor(process.uptime()),
        discordReady,
      };
      // Always 200 so Render keep-alives succeed; discordReady shows gateway state.
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[greekbot] Health server on 0.0.0.0:${port}`);
  });
}

/**
 * Ping ourselves so Render Free does not spin down after ~15m idle.
 * Self-ping only works while the process is already awake — pair with an
 * external cron hitting https://greekbot.onrender.com/health every few minutes.
 */
export function startKeepAlive(): void {
  const base =
    process.env.KEEP_ALIVE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    (Number(process.env.PORT) > 0 ? `http://127.0.0.1:${process.env.PORT}` : "");
  if (!base) {
    console.log("[greekbot] Keep-alive skipped (no URL/PORT)");
    return;
  }

  const url = `${base.replace(/\/$/, "")}/health`;
  const tick = () => {
    fetch(url)
      .then((r) => {
        if (!r.ok) console.warn("[greekbot] Keep-alive non-OK", r.status);
      })
      .catch((err) => console.warn("[greekbot] Keep-alive failed", (err as Error).message));
  };

  // Every 2 minutes — well under Render Free's ~15m idle spin-down.
  setTimeout(tick, 10_000).unref();
  setInterval(tick, 2 * 60 * 1000).unref();
  console.log(`[greekbot] Keep-alive → ${url} (every 2m)`);
}
