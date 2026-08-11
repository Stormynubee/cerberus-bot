import {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  Interaction,
  MessageFlags,
  PermissionFlagsBits,
  REST,
  Routes,
} from "discord.js";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { handleHelpButton } from "./commands/help.js";
import { handleCrashButton } from "./commands/crash.js";
import { handleHighLowButton } from "./commands/highlow.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { handleBlackjackButton } from "./games/blackjack.js";
import { handleCoinflipButton } from "./games/coinflip.js";
import { handleRpsButton, handleRpsPickButton } from "./games/rps.js";
import { handleHungerButton } from "./hungergames/runner.js";
import { connectRedis, disconnectRedis } from "./locks.js";
import { maybeSyncBotAvatar, startPresenceRotation } from "./services/branding.js";
import { sweepExpiredChallenges } from "./services/expiry.js";
import { errorEmbed } from "./utils/embeds.js";

export type BotCommand = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: Interaction & { commandName: string }) => Promise<void>;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadCommands(): Promise<Collection<string, BotCommand>> {
  const commands = new Collection<string, BotCommand>();
  const dir = path.join(__dirname, "commands");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    if (mod.data && mod.execute) {
      commands.set(mod.data.name, mod as BotCommand);
    }
  }
  return commands;
}

export async function registerCommands(commands: Collection<string, BotCommand>) {
  // Force clear Discord default permission locks so @everyone can use public commands.
  // /admin stays Manage Server only. Server owners can still override in Integrations UI.
  const body = [...commands.values()].map((c) => {
    const json = c.data.toJSON() as Record<string, unknown>;
    if (c.data.name === "admin") {
      json.default_member_permissions = String(PermissionFlagsBits.ManageGuild);
    } else {
      json.default_member_permissions = null;
    }
    json.dm_permission = false;
    return json;
  });
  const rest = new REST({ version: "10" }).setToken(config.token());

  if (config.guildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId(), config.guildId), {
      body,
    });
    console.log(`[commands] Registered ${body.length} guild commands (public + admin)`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId()), { body });
    console.log(`[commands] Registered ${body.length} global commands (public + admin)`);
  }
}

export function createClient(commands: Collection<string, BotCommand>) {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  client.once(Events.ClientReady, (c) => {
    console.log(`[greekbot] Online as ${c.user.tag}`);
    startPresenceRotation(c);
    void maybeSyncBotAvatar(c);

    const sweep = () => {
      sweepExpiredChallenges()
        .then((n) => {
          if (n > 0) console.log(`[greekbot] Refunded ${n} expired duel(s)`);
        })
        .catch((err) => console.warn("[expiry]", err));
    };
    sweep();
    setInterval(sweep, 30_000).unref();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (!command) return;
        await command.execute(interaction as never);
        return;
      }

      if (interaction.isButton()) {
        const id = interaction.customId;
        if (id.startsWith("help:") || id.startsWith("hell:")) {
          await handleHelpButton(interaction);
          return;
        }
        if (id.startsWith("cf:")) {
          await handleCoinflipButton(interaction);
          return;
        }
        if (id.startsWith("rps:")) {
          await handleRpsButton(interaction);
          return;
        }
        if (id.startsWith("rpspick:")) {
          await handleRpsPickButton(interaction);
          return;
        }
        if (id.startsWith("bj:")) {
          await handleBlackjackButton(interaction);
          return;
        }
        if (id.startsWith("hg:")) {
          await handleHungerButton(interaction);
          return;
        }
        if (id.startsWith("crash:")) {
          await handleCrashButton(interaction);
          return;
        }
        if (id.startsWith("hl:")) {
          await handleHighLowButton(interaction);
          return;
        }
      }
    } catch (err) {
      console.error("[interaction]", err);
      const embed = errorEmbed("Something went wrong in the Inferno. Try again.");
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => undefined);
        } else {
          await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => undefined);
        }
      }
    }
  });

  return client;
}

export async function shutdown() {
  await disconnectRedis();
  await prisma.$disconnect();
}
