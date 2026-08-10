import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { startBlackjack } from "../games/blackjack.js";
import { EconomyError } from "../services/wallet.js";
import { errorEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play blackjack vs Cerberus for HellCatCoins")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager in HCC").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  try {
    await startBlackjack(interaction, amount);
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Blackjack failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
    }
  }
}
