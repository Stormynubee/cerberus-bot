import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { qualifiesForVipDaily } from "../services/staff.js";
import { claimDaily, EconomyError } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { respond } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("daily")
  .setDescription("Claim 10 HCC daily (20 if VIP or server booster)");

export async function execute(interaction: ChatInputCommandInteraction) {
  try {
    let member = interaction.member;
    if (!member && interaction.guild) {
      member = await interaction.guild.members
        .fetch(interaction.user.id)
        .catch(() => null);
    }
    const vipDaily = qualifiesForVipDaily(member);
    const result = await claimDaily(interaction.user.id, interaction.user.username, {
      vipDaily,
    });
    const rateNote = vipDaily ? " (VIP / server booster)" : "";
    await respond(interaction, {
      embeds: [
        successEmbed(
          `${theme.emojis.fire} Daily tribute claimed`,
          `Cerberus grants **${formatCoins(result.payout)}**${rateNote}.\n` +
            `Streak: **${result.streak}** day(s) · Balance: **${formatCoins(result.user.balance)}**`,
        ),
      ],
    });
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Could not claim daily.";
    await respond(interaction, { embeds: [errorEmbed(msg)] });
  }
}
