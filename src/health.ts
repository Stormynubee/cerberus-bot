import http from "node:http";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db.js";

let discordReady = false;
const requestBuckets = new Map<string, { startedAt: number; count: number }>();
const LIVE_STATE_LIMIT = 30;
const LIVE_STATE_WINDOW_MS = 60_000;

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
    if (req.url === "/public/live-state") {
      void serveLiveState(req, res);
      return;
    }
    res.writeHead(404).end();
  });

  server.listen(port, "0.0.0.0", () => {
    console.log(`[greekbot] Health server on 0.0.0.0:${port}`);
  });
}

function authorized(req: http.IncomingMessage): boolean {
  const configured = process.env.PUBLIC_STATE_API_KEY?.trim();
  const provided = req.headers["x-cerberus-api-key"];
  if (!configured || typeof provided !== "string") return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(provided);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function rateLimited(req: http.IncomingMessage): boolean {
  const forwarded = req.headers["x-forwarded-for"];
  const address =
    typeof forwarded === "string"
      ? forwarded.split(",")[0].trim()
      : req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = requestBuckets.get(address);
  if (!bucket || now - bucket.startedAt >= LIVE_STATE_WINDOW_MS) {
    requestBuckets.set(address, { startedAt: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > LIVE_STATE_LIMIT;
}

async function serveLiveState(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  if (!authorized(req)) {
    res.writeHead(process.env.PUBLIC_STATE_API_KEY ? 401 : 503);
    res.end(JSON.stringify({
      ok: false,
      error: process.env.PUBLIC_STATE_API_KEY
        ? "unauthorized"
        : "live_state_not_configured",
    }));
    return;
  }
  if (rateLimited(req)) {
    res.writeHead(429, { "Retry-After": "60" });
    res.end(JSON.stringify({ ok: false, error: "rate_limited" }));
    return;
  }

  try {
    const games = await prisma.arenaGame.findMany({
      where: { status: { in: ["signup", "running"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: {
        id: true,
        status: true,
        phase: true,
        dayNumber: true,
        maxPlayers: true,
        updatedAt: true,
        createdAt: true,
        tributes: {
          orderBy: { joinedAt: "asc" },
          select: {
            displayName: true,
            alive: true,
            kills: true,
            joinedAt: true,
          },
        },
      },
    });
    const state = games.map((game) => {
      const participants = game.tributes.map((tribute) => ({
        displayName: tribute.displayName,
        alive: tribute.alive,
        kills: tribute.kills,
        joinedAt: tribute.joinedAt,
      }));
      return {
        gameId: game.id,
        status: game.status,
        phase: game.phase,
        dayNumber: game.dayNumber,
        maxPlayers: game.maxPlayers,
        createdAt: game.createdAt,
        updatedAt: game.updatedAt,
        participants,
        leaderboard: [...participants].sort((a, b) => b.kills - a.kills),
      };
    });
    res.writeHead(200);
    res.end(JSON.stringify({ ok: true, updatedAt: new Date(), games: state }));
  } catch (error) {
    console.error("[greekbot] Live-state query failed", error);
    res.writeHead(503);
    res.end(JSON.stringify({ ok: false, error: "live_state_unavailable" }));
  }
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
