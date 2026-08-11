import http from "node:http";

/** Render web services require binding to PORT; Discord bots do not otherwise serve HTTP. */
export function startHealthServer(): void {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return;

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          service: "greekbot",
          uptime: Math.floor(process.uptime()),
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[greekbot] Health server on 0.0.0.0:${port}`);
  });
}

/**
 * Ping ourselves so Render Free does not spin down after 15m idle.
 * Without this, Discord slash commands hit a dead process → "application did not respond".
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

  // First ping after boot, then every 4 minutes (under Render's ~15m idle spin-down).
  setTimeout(tick, 15_000).unref();
  setInterval(tick, 4 * 60 * 1000).unref();
  console.log(`[greekbot] Keep-alive → ${url}`);
}
