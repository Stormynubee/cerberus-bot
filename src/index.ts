import "dotenv/config";
import { createClient, loadCommands, registerCommands, shutdown } from "./client.js";
import { recoverStuckArenas } from "./hungergames/runner.js";
import { startHealthServer, startKeepAlive, setDiscordReady } from "./health.js";
import { connectRedis } from "./locks.js";
import { bootstrapDatabase, verifyDatabaseConnection } from "./services/dbBootstrap.js";
import { sweepExpiredChallenges } from "./services/expiry.js";

/**
 * Boot order matters for Discord's 3s slash-command ACK window:
 * 1) HTTP health (Render)
 * 2) Load commands from disk (fast)
 * 3) Login to Discord ASAP — never block this on DB/Redis
 * 4) Warm DB/Redis in background; slash handlers already deferReply first
 */
async function main() {
  startHealthServer();
  startKeepAlive();

  const commands = await loadCommands();
  const client = createClient(commands);

  const stop = async () => {
    console.log("[greekbot] Shutting down…");
    setDiscordReady(false);
    client.destroy();
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Connect Discord before any network DB work so interactions are received.
  await client.login(process.env.DISCORD_TOKEN);
  setDiscordReady(true);
  console.log("[greekbot] Discord gateway connected");

  void (async () => {
    try {
      await verifyDatabaseConnection();
      console.log("[greekbot] Database connected");
      await bootstrapDatabase();
      await connectRedis();
    } catch (err) {
      console.error("[greekbot] DB/Redis boot failed — commands may error until fixed", err);
    }

    try {
      await registerCommands(commands);
    } catch (err) {
      console.warn("[greekbot] Command register failed", err);
    }

    try {
      const recovered = await recoverStuckArenas();
      if (recovered > 0) console.log(`[greekbot] Recovered ${recovered} stuck arena game(s)`);
      const refunded = await sweepExpiredChallenges();
      if (refunded > 0) console.log(`[greekbot] Refunded ${refunded} abandoned wager(s) on boot`);
    } catch (err) {
      console.warn("[greekbot] Boot recovery failed", err);
    }
  })();
}

process.on("unhandledRejection", (err) => {
  console.error("[greekbot] unhandledRejection", err);
});
process.on("uncaughtException", (err) => {
  console.error("[greekbot] uncaughtException", err);
  process.exit(1);
});

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
