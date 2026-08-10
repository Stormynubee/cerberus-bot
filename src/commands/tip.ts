import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { EconomyError, ensureUser, transfer } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";

export const data = new SlashCommandBuilder()
  .setName("tip")
  .setDescription("Tip HellCatCoins to another member")
  .addUserOption((o) =>
    o.setName("user").setDescription("Who receives the tip").setRequired(true),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Amount of HCC").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  try {
    await ensureUser(interaction.user.id, interaction.user.username);
    await ensureUser(target.id, target.username);
    const { from, to } = await transfer(interaction.user.id, target.id, amount);
    await interaction.reply({
      embeds: [
        successEmbed(
          `${theme.emojis.coin} Tip sent`,
          `${interaction.user} tipped ${target} **${formatCoins(amount)}**.\n` +
            `Your balance: **${formatCoins(from.balance)}** · Theirs: **${formatCoins(to.balance)}**`,
        ),
      ],
    });
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Tip failed.";
    await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
  }
}
