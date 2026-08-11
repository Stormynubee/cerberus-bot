import http from "node:http";

/** Render web services require binding to PORT; Discord bots do not otherwise serve HTTP. */
export function startHealthServer(): void {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return;

  const server = http.createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, service: "greekbot" }));
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[greekbot] Health server on 0.0.0.0:${port}`);
  });
}
