import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getJackpot } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";
import { respond } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("jackpot")
  .setDescription("Check the progressive HellCatCoins jackpot");

export async function execute(interaction: ChatInputCommandInteraction) {
  const pot = await getJackpot();
  await respond(interaction, {
    embeds: [
      baseEmbed(theme.colors.gold)
        .setTitle(`${theme.emojis.fire} Progressive Jackpot`)
        .setDescription(
          `Current pot: **${formatCoins(pot)}**\nFed by rake from house games (slots, roulette, crash, coinflip, blackjack…).`,
        ),
    ],
  });
}
