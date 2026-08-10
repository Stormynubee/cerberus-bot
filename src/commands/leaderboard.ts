import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getJackpot, topBalances } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Top HellCatCoins wallets in the Inferno");

export async function execute(interaction: ChatInputCommandInteraction) {
  const rows = await topBalances(10);
  const pot = await getJackpot();

  const lines =
    rows.length === 0
      ? "_No gladiators yet. Claim /daily to enter the vault._"
      : rows
          .map((u, i) => {
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `\`${i + 1}.\``;
            const name = u.username ? `**${u.username}**` : `<@${u.id}>`;
            return `${medal} ${name} — **${formatCoins(u.balance)}**`;
          })
          .join("\n");

  await interaction.reply({
    embeds: [
      baseEmbed(theme.colors.gold)
        .setTitle(`${theme.emojis.trophy} Inferno Leaderboard`)
        .setDescription(lines)
        .addFields({
          name: `${theme.emojis.fire} Progressive Jackpot`,
          value: formatCoins(pot),
        }),
    ],
  });
}
