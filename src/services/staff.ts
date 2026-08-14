import {
  Guild,
  GuildMember,
  PermissionFlagsBits,
  User,
} from "discord.js";
import { config } from "../config.js";

/** Pure staff check so smoke tests can cover tip-recipient rules without Discord. */
export function memberCanReceiveTips(input: {
  ownerId: string;
  userId: string;
  bot: boolean;
  administrator: boolean;
  manageGuild: boolean;
  manageMessages: boolean;
  kickMembers: boolean;
  banMembers: boolean;
  moderateMembers: boolean;
}): boolean {
  if (input.bot) return false;
  if (input.userId === input.ownerId) return true;
  return (
    input.administrator ||
    input.manageGuild ||
    input.manageMessages ||
    input.kickMembers ||
    input.banMembers ||
    input.moderateMembers
  );
}

function flagsFrom(member: GuildMember) {
  const p = member.permissions;
  return {
    administrator: p.has(PermissionFlagsBits.Administrator),
    manageGuild: p.has(PermissionFlagsBits.ManageGuild),
    manageMessages: p.has(PermissionFlagsBits.ManageMessages),
    kickMembers: p.has(PermissionFlagsBits.KickMembers),
    banMembers: p.has(PermissionFlagsBits.BanMembers),
    moderateMembers: p.has(PermissionFlagsBits.ModerateMembers),
  };
}

/** Discord server booster or configured VIP role → 20 HCC daily instead of 10. */
export function qualifiesForVipDaily(member: unknown): boolean {
  if (!member || typeof member !== "object") return false;
  const m = member as {
    premiumSince?: Date | string | null;
    premium_since?: string | null;
    roles?: { cache?: { has: (id: string) => boolean } } | string[];
  };
  if (m.premiumSince) return true;
  if (m.premium_since) return true;

  const vipId = config.vipRoleId;
  if (!vipId) return false;
  if (Array.isArray(m.roles)) return m.roles.includes(vipId);
  if (m.roles?.cache?.has(vipId)) return true;
  return false;
}

/** Owner, Administrator, Manage Server, or typical mod perms. Never bots. */
export async function canReceiveTip(guild: Guild, user: User): Promise<boolean> {
  if (user.bot) return false;
  if (guild.ownerId === user.id) return true;

  const member =
    guild.members.cache.get(user.id) ??
    (await guild.members.fetch(user.id).catch(() => null));
  if (!member) return false;

  return memberCanReceiveTips({
    ownerId: guild.ownerId,
    userId: user.id,
    bot: member.user.bot,
    ...flagsFrom(member),
  });
}
