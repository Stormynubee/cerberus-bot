import { Collection, Message } from "discord.js";
import { config } from "../config.js";
import { errorEmbed } from "../utils/embeds.js";
import { createPrefixInteraction } from "./adapter.js";
import {
  PrefixParseError,
  SlashCommandJson,
  bindPrefixArgs,
  extractPrefixBody,
  isUserToken,
  resolveCommandName,
  tokenize,
} from "./parse.js";

type PrefixBotCommand = {
  data: { name: string; toJSON: () => unknown };
  execute: (interaction: never) => Promise<void>;
};

const inFlight = new Set<string>();

export async function handlePrefixMessage(
  message: Message,
  commands: Collection<string, PrefixBotCommand>,
): Promise<void> {
  if (message.author.bot || message.webhookId) return;
  if (!message.guildId) return;
  if (!message.channel.isTextBased()) return;

  const prefix = config.prefix;
  const body = extractPrefixBody(message.content, prefix, message.client.user?.id);
  if (body == null) return;

  const tokens = tokenize(body);
  if (tokens.length === 0) return;

  const commandName = resolveCommandName(tokens[0]!);
  const command = commands.get(commandName);
  if (!command) return;

  const lockKey = `${message.author.id}:${commandName}`;
  if (inFlight.has(lockKey)) return;
  inFlight.add(lockKey);

  try {
    const json = command.data.toJSON() as SlashCommandJson;
    json.name = commandName;
    const bound = bindPrefixArgs(tokens.slice(1), json, prefix);
    bound.commandName = commandName;
    await prefetchUsers(message, bound.values);

    const member =
      message.member ??
      (message.guild
        ? await message.guild.members.fetch(message.author.id).catch(() => null)
        : null);
    const interaction = createPrefixInteraction(message, bound, json, member);
    await interaction.deferReply();
    try {
      await command.execute(interaction as never);
    } catch (cmdErr) {
      const text =
        cmdErr instanceof PrefixParseError
          ? cmdErr.message
          : "Something went wrong. Try again in a moment.";
      if (!(cmdErr instanceof PrefixParseError)) {
        console.error(`[prefix] ${prefix}${commandName} failed`, cmdErr);
      }
      await interaction
        .editReply({ embeds: [errorEmbed(text)] })
        .catch(async () => {
          await message
            .reply({
              embeds: [errorEmbed(text)],
              allowedMentions: { parse: [], repliedUser: false },
            })
            .catch(() => undefined);
        });
    }
  } catch (err) {
    const text =
      err instanceof PrefixParseError
        ? err.message
        : "Something went wrong. Try again in a moment.";
    if (!(err instanceof PrefixParseError)) {
      console.error(`[prefix] ${prefix}${commandName} failed`, err);
    }
    await message
      .reply({ embeds: [errorEmbed(text)], allowedMentions: { parse: [], repliedUser: false } })
      .catch(() => undefined);
  } finally {
    inFlight.delete(lockKey);
  }
}

async function prefetchUsers(message: Message, values: Map<string, string>): Promise<void> {
  for (const raw of values.values()) {
    if (!isUserToken(raw)) continue;
    const id = raw.match(/^<@!?(\d+)>$/)?.[1] ?? raw;
    if (message.mentions.users.has(id) || message.client.users.cache.has(id)) continue;
    await message.client.users.fetch(id).catch(() => undefined);
  }
}
