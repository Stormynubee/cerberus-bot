import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { startBlackjack } from "../games/blackjack.js";
import { isDbUnreachable, vaultOfflineMessage } from "../db.js";
import { EconomyError } from "../services/wallet.js";
import { errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("blackjack")
  .setDescription("Play blackjack vs Cerberus — stands on all 17, no double/split")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager in HCC").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  await ackCommand(interaction);
  try {
    await startBlackjack(interaction, amount);
  } catch (err) {
    const msg =
      err instanceof EconomyError
        ? err.message
        : isDbUnreachable(err)
          ? vaultOfflineMessage()
          : "Blackjack failed.";
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
