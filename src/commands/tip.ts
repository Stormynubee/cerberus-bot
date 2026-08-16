import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { isDbUnreachable, vaultOfflineMessage } from "../db.js";
import { canReceiveTip } from "../services/staff.js";
import { EconomyError, ensureUser, transfer } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { errorEmbed, successEmbed } from "../utils/embeds.js";
import { respond } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("tip")
  .setDescription("Tip HellCatCoins to the server owner, an admin, or a mod")
  .addUserOption((o) =>
    o
      .setName("user")
      .setDescription("Owner, admin, or mod who receives the tip")
      .setRequired(true),
  )
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Amount of HCC").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user", true);
  const amount = interaction.options.getInteger("amount", true);

  try {
    const guild = interaction.guild;
    if (!guild) {
      throw new EconomyError("Tips only work inside the server.");
    }
    if (target.id === interaction.user.id) {
      throw new EconomyError("You cannot tip yourself.");
    }
    if (!(await canReceiveTip(guild, target))) {
      throw new EconomyError(
        "You can only tip the **server owner**, an **admin**, or a **mod**.",
      );
    }

    await ensureUser(interaction.user.id, interaction.user.username);
    await ensureUser(target.id, target.username);
    const { from, to } = await transfer(interaction.user.id, target.id, amount);
    await respond(interaction, {
      embeds: [
        successEmbed(
          `${theme.emojis.coin} Tip sent`,
          `${interaction.user} tipped ${target} **${formatCoins(amount)}**.\n` +
            `Your balance: **${formatCoins(from.balance)}** · Theirs: **${formatCoins(to.balance)}**`,
        ),
      ],
    });
  } catch (err) {
    const msg =
      err instanceof EconomyError
        ? err.message
        : isDbUnreachable(err)
          ? vaultOfflineMessage()
          : "Tip failed.";
    await respond(interaction, { embeds: [errorEmbed(msg)] });
  }
}
