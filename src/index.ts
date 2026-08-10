import "dotenv/config";
import { createClient, loadCommands, registerCommands, shutdown } from "./client.js";
import { recoverStuckArenas } from "./hungergames/runner.js";
import { connectRedis } from "./locks.js";
import { sweepExpiredChallenges } from "./services/expiry.js";

async function main() {
  await connectRedis();

  const recovered = await recoverStuckArenas();
  if (recovered > 0) console.log(`[greekbot] Recovered ${recovered} stuck arena game(s)`);

  const refunded = await sweepExpiredChallenges();
  if (refunded > 0) console.log(`[greekbot] Refunded ${refunded} abandoned wager(s) on boot`);

  const commands = await loadCommands();
  await registerCommands(commands);

  const client = createClient(commands);

  const stop = async () => {
    console.log("[greekbot] Shutting down…");
    client.destroy();
    await shutdown();
    process.exit(0);
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await client.login(process.env.DISCORD_TOKEN);
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
