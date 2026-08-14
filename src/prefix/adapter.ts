import {
  ChatInputCommandInteraction,
  GuildMember,
  Message,
  PermissionsBitField,
  Role,
  User,
} from "discord.js";
import {
  BoundPrefixArgs,
  PrefixParseError,
  SlashCommandJson,
  SlashOptionJson,
  matchChoice,
  parseBool,
} from "./parse.js";

type Payload = Record<string, unknown> | string;

function cleanPayload(payload: Payload): Payload {
  if (typeof payload === "string") return payload;
  const rest = { ...payload };
  delete rest.flags;
  delete rest.ephemeral;
  delete rest.fetchReply;
  delete rest.withResponse;
  return rest;
}

function snowflake(raw: string): string | null {
  const m =
    raw.match(/^<@!?(\d+)>$/) ||
    raw.match(/^<#(\d+)>$/) ||
    raw.match(/^<@&(\d+)>$/) ||
    (/^\d{17,20}$/.test(raw) ? [raw, raw] : null);
  return m?.[1] ?? null;
}

export function createPrefixInteraction(
  message: Message,
  bound: BoundPrefixArgs,
  commandJson: SlashCommandJson,
  member: GuildMember | null = message.member as GuildMember | null,
): ChatInputCommandInteraction {
  const optionDefs: SlashOptionJson[] = bound.subcommand
    ? (commandJson.options?.find((o) => o.name === bound.subcommand)?.options ?? [])
    : (commandJson.options ?? []);

  let deferred = false;
  let replied = false;
  let replyMessage: Message | null = null;

  const options = {
    getSubcommand(required = true): string {
      if (bound.subcommand) return bound.subcommand;
      if (required) throw new PrefixParseError("Missing subcommand.");
      return null as unknown as string;
    },
    getInteger(name: string, required = false): number | null {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}**.`);
        return null;
      }
      const n = Number.parseInt(raw, 10);
      if (!Number.isFinite(n)) {
        throw new PrefixParseError(`**${name}** must be a number.`);
      }
      return n;
    },
    getString(name: string, required = false): string | null {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}**.`);
        return null;
      }
      const def = optionDefs.find((o) => o.name === name);
      if (def?.choices?.length) {
        const mapped = matchChoice(def, raw);
        if (mapped == null) {
          throw new PrefixParseError(
            `**${name}** must be ${def.choices.map((c) => String(c.value)).join(" / ")}.`,
          );
        }
        return mapped;
      }
      return raw;
    },
    getBoolean(name: string, required = false): boolean | null {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}**.`);
        return null;
      }
      const b = parseBool(raw);
      if (b == null) throw new PrefixParseError(`**${name}** must be true or false.`);
      return b;
    },
    getUser(name: string, required = false): User | null {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}** (mention a user).`);
        return null;
      }
      const id = snowflake(raw);
      if (!id) {
        if (required) throw new PrefixParseError(`**${name}** must mention a user.`);
        return null;
      }
      const cached =
        message.mentions.users.get(id) ?? message.client.users.cache.get(id) ?? null;
      if (cached) return cached;
      throw new PrefixParseError(`Could not resolve user for **${name}**. Mention them with @.`);
    },
    getChannel(name: string, required = false) {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}**.`);
        return null;
      }
      const id = snowflake(raw);
      if (!id) {
        if (required) throw new PrefixParseError(`**${name}** must mention a channel.`);
        return null;
      }
      return (
        message.mentions.channels.get(id) ??
        message.guild?.channels.cache.get(id) ??
        null
      );
    },
    getRole(name: string, required = false): Role | null {
      const raw = bound.values.get(name);
      if (raw == null) {
        if (required) throw new PrefixParseError(`Missing **${name}**.`);
        return null;
      }
      const id = snowflake(raw);
      if (!id) {
        if (required) throw new PrefixParseError(`**${name}** must mention a role.`);
        return null;
      }
      return (
        (message.mentions.roles.get(id) as Role | undefined) ??
        message.guild?.roles.cache.get(id) ??
        null
      );
    },
  };

  const sendOrEdit = async (payload: Payload): Promise<Message> => {
    const body = cleanPayload(payload);
    if (!replyMessage) {
      replyMessage = await message.reply({
        ...(typeof body === "string" ? { content: body } : body),
        allowedMentions: { parse: [], repliedUser: false },
      } as never);
      replied = true;
      return replyMessage;
    }
    replyMessage = await replyMessage.edit(body as never);
    return replyMessage;
  };

  const fake = {
    user: message.author,
    member: member as GuildMember | null,
    memberPermissions: member?.permissions ?? new PermissionsBitField(),
    guild: message.guild,
    guildId: message.guildId,
    channel: message.channel,
    channelId: message.channelId,
    client: message.client,
    commandName: bound.commandName,
    createdAt: message.createdAt,
    createdTimestamp: message.createdTimestamp,
    id: message.id,
    options,
    get deferred() {
      return deferred;
    },
    get replied() {
      return replied;
    },
    inGuild: () => Boolean(message.guildId),
    isChatInputCommand: () => true,
    isRepliable: () => true,
    async deferReply() {
      deferred = true;
      if (message.channel.isTextBased() && "sendTyping" in message.channel) {
        await message.channel.sendTyping().catch(() => undefined);
      }
      return fake as unknown as ChatInputCommandInteraction;
    },
    async reply(payload: Payload) {
      const msg = await sendOrEdit(payload);
      return msg;
    },
    async editReply(payload: Payload) {
      deferred = true;
      return sendOrEdit(payload);
    },
    async followUp(payload: Payload) {
      const body = cleanPayload(payload);
      if (!message.channel.isTextBased() || !("send" in message.channel)) {
        throw new PrefixParseError("Cannot send in this channel.");
      }
      return message.channel.send(
        (typeof body === "string" ? { content: body } : body) as never,
      );
    },
    async fetchReply() {
      if (!replyMessage) throw new PrefixParseError("No reply to fetch yet.");
      return replyMessage;
    },
    async deleteReply() {
      if (replyMessage) {
        await replyMessage.delete().catch(() => undefined);
        replyMessage = null;
      }
    },
  };

  return fake as unknown as ChatInputCommandInteraction;
}
