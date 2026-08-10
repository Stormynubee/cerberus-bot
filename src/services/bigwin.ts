import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  TextChannel,
} from "discord.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";

export async function maybeAnnounceBigWin(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  profit: number,
  game: string,
) {
  if (profit <= 0) return;
  if (!interaction.guildId) return;

  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: interaction.guildId },
  });
  const threshold = settings?.bigWinThreshold ?? config.bigWinThreshold;
  if (profit < threshold) return;

  const channelId = settings?.bigWinChannelId;
  const embed = baseEmbed(theme.colors.gold)
    .setTitle(`${theme.emojis.trophy} Big Win in the Inferno`)
    .setDescription(
      `${interaction.user} just stacked **${formatCoins(profit)}** profit on **${game}**!`,
    );

  if (channelId) {
    try {
      const ch = await interaction.client.channels.fetch(channelId);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        await (ch as TextChannel).send({ embeds: [embed] });
        return;
      }
    } catch {
      // fall through
    }
  }

  if (interaction.channel?.isTextBased()) {
    await interaction.followUp({ embeds: [embed] }).catch(() => undefined);
  }
}
