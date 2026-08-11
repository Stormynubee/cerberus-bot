import {
  ColorResolvable,
  EmbedBuilder,
  User as DiscordUser,
} from "discord.js";
import { theme, formatCoins } from "../theme.js";

export function baseEmbed(color: ColorResolvable = theme.colors.inferno): EmbedBuilder {
  return new EmbedBuilder().setColor(color).setTimestamp();
}

export function walletEmbed(
  user: DiscordUser,
  balance: number,
  extras?: { title?: string; description?: string },
): EmbedBuilder {
  return baseEmbed(theme.colors.gold)
    .setTitle(extras?.title ?? `${theme.emojis.coin} HellCatCoins Wallet`)
    .setDescription(
      extras?.description ??
        `${user} holds **${formatCoins(balance)}** in the Inferno vault.`,
    )
    .setThumbnail(user.displayAvatarURL({ size: 128 }));
}

export function errorEmbed(message: string): EmbedBuilder {
  return baseEmbed(theme.colors.danger)
    .setTitle(`${theme.emojis.skull} Denied by Cerberus`)
    .setDescription(message);
}

export function successEmbed(title: string, description: string): EmbedBuilder {
  return baseEmbed(theme.colors.success).setTitle(title).setDescription(description);
}
