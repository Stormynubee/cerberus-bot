import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { ensureUser, getBalance } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { walletEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("balance")
  .setDescription("Check your HellCatCoins wallet")
  .addUserOption((o) =>
    o.setName("user").setDescription("Peek at another gladiator's vault"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  await ensureUser(target.id, target.username);
  const user = await getBalance(target.id, target.username);

  await interaction.reply({
    embeds: [
      walletEmbed(target, user.balance, {
        description:
          `${target} holds **${formatCoins(user.balance)}** in the Inferno vault.\n` +
          `${theme.emojis.fire} Daily streak: **${user.dailyStreak}**`,
      }),
    ],
  });
}
