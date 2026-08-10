import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { ensureUser, getBalance } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View HellCatCoins combat stats")
  .addUserOption((o) => o.setName("user").setDescription("Whose profile to view"));

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  await ensureUser(target.id, target.username);
  const u = await getBalance(target.id);

  const played = u.wins + u.losses + u.ties;
  const winRate = played === 0 ? "—" : `${Math.round((u.wins / played) * 100)}%`;

  await interaction.reply({
    embeds: [
      baseEmbed(theme.colors.inferno)
        .setTitle(`${theme.emojis.swords} ${target.username}'s Inferno Record`)
        .setThumbnail(target.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: "Balance", value: formatCoins(u.balance), inline: true },
          { name: "Win rate", value: winRate, inline: true },
          { name: "Daily streak", value: String(u.dailyStreak), inline: true },
          { name: "Wins", value: String(u.wins), inline: true },
          { name: "Losses", value: String(u.losses), inline: true },
          { name: "Ties", value: String(u.ties), inline: true },
          { name: "Biggest win", value: formatCoins(u.biggestWin), inline: true },
          { name: "Current streak", value: String(u.currentStreak), inline: true },
          { name: "Best streak", value: String(u.bestStreak), inline: true },
        ),
    ],
  });
}
