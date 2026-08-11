import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { challengeCoinflipPvP, playCoinflipVsHouse } from "../games/coinflip.js";
import { EconomyError } from "../services/wallet.js";
import { errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("coinflip")
  .setDescription("HellCat coin spin — vs house or another member")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager in HCC").setRequired(true).setMinValue(1),
  )
  .addStringOption((o) =>
    o
      .setName("side")
      .setDescription("Heads or tails")
      .setRequired(true)
      .addChoices(
        { name: "Heads", value: "heads" },
        { name: "Tails", value: "tails" },
      ),
  )
  .addUserOption((o) =>
    o.setName("opponent").setDescription("Challenge a member (PvP). Omit to play the house."),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const side = interaction.options.getString("side", true) as "heads" | "tails";
  const opponent = interaction.options.getUser("opponent");

  // Ack within Discord's 3s window — DB/wallet work happens after.
  await ackCommand(interaction);

  try {
    if (opponent) {
      await challengeCoinflipPvP(interaction, opponent, amount, side);
    } else {
      await playCoinflipVsHouse(interaction, amount, side);
    }
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Coinflip failed.";
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
