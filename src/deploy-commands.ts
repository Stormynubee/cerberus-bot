import "dotenv/config";
import { loadCommands, registerCommands, shutdown } from "./client.js";

async function main() {
  const commands = await loadCommands();
  await registerCommands(commands);
  await shutdown();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
