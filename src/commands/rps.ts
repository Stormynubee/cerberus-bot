import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { challengeRps } from "../games/rps.js";
import { EconomyError } from "../services/wallet.js";
import { errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("rps")
  .setDescription("1v1 Rock–Paper–Scissors duel for HellCatCoins")
  .addUserOption((o) =>
    o.setName("opponent").setDescription("Who you challenge").setRequired(true),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager in HCC").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const opponent = interaction.options.getUser("opponent", true);
  const amount = interaction.options.getInteger("amount", true);

  await ackCommand(interaction);
  try {
    await challengeRps(interaction, opponent, amount);
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Challenge failed.";
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
