/** Prefix command parsing — maps `!slots 25` onto slash-command option schemas. */

export class PrefixParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PrefixParseError";
  }
}

export const COMMAND_ALIASES: Record<string, string> = {
  hg: "hungergames",
  hunger: "hungergames",
  hungergame: "hungergames",
  bal: "balance",
  wallet: "balance",
  lb: "leaderboard",
  board: "leaderboard",
  cf: "coinflip",
  coin: "coinflip",
  bj: "blackjack",
  hl: "highlow",
  rl: "roulette",
  stats: "profile",
};

const SUB_COMMAND = 1;
const STRING = 3;
const INTEGER = 4;
const BOOLEAN = 5;
const USER = 6;
const CHANNEL = 7;
const ROLE = 8;

export type SlashOptionJson = {
  type: number;
  name: string;
  required?: boolean;
  choices?: { name: string; value: string | number }[];
  options?: SlashOptionJson[];
};

export type SlashCommandJson = {
  name: string;
  options?: SlashOptionJson[];
};

export type BoundPrefixArgs = {
  commandName: string;
  subcommand: string | null;
  /** Raw token assigned to each option name. */
  values: Map<string, string>;
};

export function tokenize(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    tokens.push(m[1] ?? m[2]!);
  }
  return tokens;
}

/** Pull `!slots 25` or `@Bot !slots 25` / `@Bot slots 25` into a command name + args. */
export function extractPrefixBody(
  content: string,
  prefix: string,
  botUserId?: string,
): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (prefix && trimmed.startsWith(prefix)) {
    return trimmed.slice(prefix.length).trim();
  }

  if (botUserId) {
    const mentions = [`<@${botUserId}>`, `<@!${botUserId}>`];
    for (const tag of mentions) {
      if (trimmed.startsWith(tag)) {
        let rest = trimmed.slice(tag.length).trim();
        if (prefix && rest.startsWith(prefix)) rest = rest.slice(prefix.length).trim();
        return rest || null;
      }
    }
  }

  return null;
}

export function resolveCommandName(raw: string): string {
  const key = raw.toLowerCase();
  return COMMAND_ALIASES[key] ?? key;
}

export function usageFor(
  prefix: string,
  command: SlashCommandJson,
  subName?: string | null,
): string {
  const p = prefix || "!";
  const subs = (command.options ?? []).filter((o) => o.type === SUB_COMMAND);
  if (subs.length > 0) {
    const sub = subName ? subs.find((s) => s.name === subName) : undefined;
    if (!sub) {
      return `${p}${command.name} <${subs.map((s) => s.name).join("|")}>`;
    }
    const args = (sub.options ?? []).map(formatArg).join(" ");
    return `${p}${command.name} ${sub.name}${args ? ` ${args}` : ""}`;
  }
  const args = (command.options ?? []).map(formatArg).join(" ");
  return `${p}${command.name}${args ? ` ${args}` : ""}`;
}

function formatArg(opt: SlashOptionJson): string {
  const inner =
    opt.choices && opt.choices.length > 0
      ? opt.choices.map((c) => String(c.value)).join("|")
      : opt.name;
  return opt.required ? `<${inner}>` : `[${opt.name}]`;
}

export function bindPrefixArgs(
  tokens: string[],
  command: SlashCommandJson,
  prefix: string,
): BoundPrefixArgs {
  const subs = (command.options ?? []).filter((o) => o.type === SUB_COMMAND);
  let subcommand: string | null = null;
  let rest = tokens;
  let optionDefs: SlashOptionJson[] = command.options ?? [];

  if (subs.length > 0) {
    const subTok = rest[0]?.toLowerCase();
    const sub = subTok ? subs.find((s) => s.name === subTok) : undefined;
    if (!sub) {
      throw new PrefixParseError(
        `Use a subcommand.\nUsage: \`${usageFor(prefix, command)}\``,
      );
    }
    subcommand = sub.name;
    rest = rest.slice(1);
    optionDefs = sub.options ?? [];
  }

  const values = new Map<string, string>();
  const leftover: string[] = [];

  for (const tok of rest) {
    const named = tok.match(/^([a-z][a-z0-9_]*)[:=](.+)$/i);
    if (named) {
      const key = named[1]!.toLowerCase();
      const def = optionDefs.find((o) => o.name === key);
      if (!def) {
        throw new PrefixParseError(
          `Unknown option \`${key}\`.\nUsage: \`${usageFor(prefix, command, subcommand)}\``,
        );
      }
      values.set(def.name, named[2]!);
      continue;
    }
    leftover.push(tok);
  }

  const unfilled = () => optionDefs.filter((o) => !values.has(o.name));

  for (const tok of leftover) {
    const open = unfilled();
    const assigned =
      assignTyped(tok, open, USER, isUserToken) ||
      assignTyped(tok, open, CHANNEL, isChannelToken) ||
      assignTyped(tok, open, ROLE, isRoleToken) ||
      assignChoice(tok, open) ||
      assignTyped(tok, open, BOOLEAN, isBoolToken) ||
      assignTyped(tok, open, INTEGER, isIntToken) ||
      assignTyped(tok, open, STRING, () => true);

    if (!assigned) {
      throw new PrefixParseError(
        `Unexpected \`${tok}\`.\nUsage: \`${usageFor(prefix, command, subcommand)}\``,
      );
    }
    values.set(assigned.name, tok);
  }

  for (const opt of optionDefs) {
    if (opt.required && !values.has(opt.name)) {
      throw new PrefixParseError(
        `Missing **${opt.name}**.\nUsage: \`${usageFor(prefix, command, subcommand)}\``,
      );
    }
  }

  return { commandName: command.name, subcommand, values };
}

function assignTyped(
  tok: string,
  open: SlashOptionJson[],
  type: number,
  test: (t: string) => boolean,
): SlashOptionJson | undefined {
  if (!test(tok)) return undefined;
  return open.find((o) => o.type === type);
}

function assignChoice(tok: string, open: SlashOptionJson[]): SlashOptionJson | undefined {
  const needle = tok.toLowerCase();
  return open.find((o) =>
    (o.choices ?? []).some(
      (c) => String(c.value).toLowerCase() === needle || c.name.toLowerCase() === needle,
    ),
  );
}

export function isUserToken(t: string): boolean {
  return /^<@!?\d+>$/.test(t) || /^\d{17,20}$/.test(t);
}

export function isChannelToken(t: string): boolean {
  return /^<#\d+>$/.test(t);
}

export function isRoleToken(t: string): boolean {
  return /^<@&\d+>$/.test(t);
}

export function isIntToken(t: string): boolean {
  return /^-?\d{1,15}$/.test(t) && !/^\d{17,20}$/.test(t);
}

export function isBoolToken(t: string): boolean {
  return /^(true|false|yes|no|on|off|1|0)$/i.test(t);
}

export function parseBool(raw: string): boolean | null {
  const v = raw.toLowerCase();
  if (["true", "yes", "on", "1"].includes(v)) return true;
  if (["false", "no", "off", "0"].includes(v)) return false;
  return null;
}

export function matchChoice(
  opt: SlashOptionJson | undefined,
  raw: string,
): string | null {
  if (!opt?.choices?.length) return raw;
  const needle = raw.toLowerCase();
  const hit = opt.choices.find(
    (c) => String(c.value).toLowerCase() === needle || c.name.toLowerCase() === needle,
  );
  return hit ? String(hit.value) : null;
}
