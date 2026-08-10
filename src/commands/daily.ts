import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { claimDaily, EconomyError } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim your daily HellCatCoins tribute");

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    const result = await claimDaily(interaction.user.id, interaction.user.username);
    await interaction.reply({
      embeds: [
        successEmbed(
          `${theme.emojis.fire} Daily tribute claimed`,
          `Cerberus grants **${formatCoins(result.payout)}** ` +
            `(base + ${formatCoins(result.streakBonus)} streak bonus).\n` +
            `Streak: **${result.streak}** day(s) · Balance: **${formatCoins(result.user.balance)}**`,
        ),
      ],
    });
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Could not claim daily.";
    await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
  }
}
