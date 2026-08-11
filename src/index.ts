import "dotenv/config";
import { createClient, loadCommands, registerCommands, shutdown } from "./client.js";
import { recoverStuckArenas } from "./hungergames/runner.js";
import { startHealthServer, startKeepAlive } from "./health.js";
import { connectRedis } from "./locks.js";
import { bootstrapDatabase, verifyDatabaseConnection } from "./services/dbBootstrap.js";
import { sweepExpiredChallenges } from "./services/expiry.js";

async function main() {
  // Bind PORT first so Render marks the service healthy while we finish boot.
  startHealthServer();
  startKeepAlive();

  await verifyDatabaseConnection();
  console.log("[greekbot] Database connected");
  await bootstrapDatabase();
  await connectRedis();

  const commands = await loadCommands();
  const client = createClient(commands);

  const stop = async () => {
    console.log("[greekbot] Shutting down…");
    client.destroy();
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  // Connect to Discord ASAP — do NOT block login on command re-register / arena recovery.
  await client.login(process.env.DISCORD_TOKEN);

  void (async () => {
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
