import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Client } from "discord.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const AVATAR_PATH = path.resolve(__dirname, "../../assets/greekbot-avatar.png");

/**
 * Optionally push the repo logo to Discord (rate-limited by Discord).
 * Set SYNC_BOT_AVATAR=1 once when you want to update the live bot face.
 */
export async function maybeSyncBotAvatar(client: Client): Promise<void> {
  if (process.env.SYNC_BOT_AVATAR !== "1") return;
  if (!client.user) return;

  try {
    const buf = await readFile(AVATAR_PATH);
    await client.user.setAvatar(buf);
    console.log(`[greekbot] Avatar synced from ${AVATAR_PATH}`);
  } catch (err) {
    console.warn("[greekbot] Avatar sync skipped:", err);
  }
}

const PRESENCE_LINES = [
  "GreekBot · HellCatCoins · /help",
  "Inferno Games · /hungergames",
  "Casino open · /slots /crash",
  "GreekGodBerry · greekgambles.com",
  "Stack HCC · /daily /balance",
];

export function startPresenceRotation(client: Client): void {
  let i = 0;
  const tick = () => {
    if (!client.user) return;
    client.user.setActivity(PRESENCE_LINES[i % PRESENCE_LINES.length]!);
    i += 1;
  };
  tick();
  setInterval(tick, 45_000).unref();
}
