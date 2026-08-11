import {
  ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../db.js";
import {
  credit,
  debit,
  EconomyError,
  ensureUser,
  getBalance,
} from "../services/wallet.js";
import { config } from "../config.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";

function isAdmin(interaction: ChatInputCommandInteraction): boolean {
  return (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) === true ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) === true
  );
}

export const data = new SlashCommandBuilder()
  .setName("admin")
  .setDescription("Cerberus economy & server tools (Manage Server)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .setDMPermission(false)
  .addSubcommand((sc) =>
    sc
      .setName("grant")
      .setDescription("Grant HellCatCoins to a user")
      .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Target"))
      .addIntegerOption((o) =>
        o.setName("amount").setRequired(true).setDescription("Amount").setMinValue(1),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("revoke")
      .setDescription("Remove HellCatCoins from a user")
      .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Target"))
      .addIntegerOption((o) =>
        o.setName("amount").setRequired(true).setDescription("Amount").setMinValue(1),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("freeze")
      .setDescription("Freeze or unfreeze a wallet")
      .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Target"))
      .addBooleanOption((o) =>
        o.setName("frozen").setRequired(true).setDescription("True = freeze"),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("audit")
      .setDescription("Show recent ledger entries for a user")
      .addUserOption((o) => o.setName("user").setRequired(true).setDescription("Target")),
  )
  .addSubcommand((sc) =>
    sc
      .setName("bigwin")
      .setDescription("Set the big-win announcement channel")
      .addChannelOption((o) =>
        o.setName("channel").setDescription("Channel (omit to clear)").setRequired(false),
      )
      .addIntegerOption((o) =>
        o
          .setName("threshold")
          .setDescription(`Profit threshold (default ${config.bigWinThreshold})`)
          .setMinValue(1),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("arenamaster")
      .setDescription("Set role that can start/cancel Inferno Games")
      .addRoleOption((o) =>
        o.setName("role").setDescription("Role (omit to clear)").setRequired(false),
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  if (!isAdmin(interaction)) {
    await interaction.reply({
      embeds: [errorEmbed("Need **Manage Server** permission.")],
      ephemeral: true,
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "grant") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      await ensureUser(user.id, user.username);
      const updated = await credit(user.id, amount, `admin_grant:${interaction.user.id}`);
      await interaction.reply({
        embeds: [
          successEmbed(
            "Granted",
            `Gave ${user} **${formatCoins(amount)}**. New balance: **${formatCoins(updated.balance)}**.`,
          ),
        ],
      });
      return;
    }

    if (sub === "revoke") {
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      await ensureUser(user.id, user.username);
      const updated = await debit(user.id, amount, `admin_revoke:${interaction.user.id}`);
      await interaction.reply({
        embeds: [
          successEmbed(
            "Revoked",
            `Removed **${formatCoins(amount)}** from ${user}. Balance: **${formatCoins(updated.balance)}**.`,
          ),
        ],
      });
      return;
    }

    if (sub === "freeze") {
      const user = interaction.options.getUser("user", true);
      const frozen = interaction.options.getBoolean("frozen", true);
      await ensureUser(user.id, user.username);
      await prisma.user.update({ where: { id: user.id }, data: { frozen } });
      await interaction.reply({
        embeds: [
          successEmbed(
            frozen ? "Wallet frozen" : "Wallet unfrozen",
            `${user}'s HellCatCoins wallet is now **${frozen ? "frozen" : "active"}**.`,
          ),
        ],
      });
      return;
    }

    if (sub === "audit") {
      const user = interaction.options.getUser("user", true);
      await ensureUser(user.id, user.username);
      const bal = await getBalance(user.id);
      const entries = await prisma.ledgerEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      const lines = entries
        .map(
          (e) =>
            `\`${e.createdAt.toISOString().slice(0, 16)}\` ${e.delta >= 0 ? "+" : ""}${e.delta} · ${e.reason} · bal ${e.balance}`,
        )
        .join("\n");
      await interaction.reply({
        embeds: [
          baseEmbed(theme.colors.gold)
            .setTitle(`Audit — ${user.username}`)
            .setDescription(
              `Balance: **${formatCoins(bal.balance)}** · Frozen: **${bal.frozen}**\n\n${lines || "_No ledger yet._"}`,
            ),
        ],
        ephemeral: true,
      });
      return;
    }

    if (sub === "bigwin") {
      if (!interaction.guildId) throw new EconomyError("Server only.");
      const channel = interaction.options.getChannel("channel");
      const threshold = interaction.options.getInteger("threshold") ?? config.bigWinThreshold;
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        create: {
          guildId: interaction.guildId,
          bigWinChannelId: channel?.id ?? null,
          bigWinThreshold: threshold,
        },
        update: {
          bigWinChannelId: channel ? channel.id : null,
          bigWinThreshold: threshold,
        },
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            "Big-win feed updated",
            channel
              ? `Announcements → ${channel} when profit ≥ **${formatCoins(threshold)}**.`
              : `Channel cleared. Threshold **${formatCoins(threshold)}** (falls back to current channel).`,
          ),
        ],
      });
      return;
    }

    if (sub === "arenamaster") {
      if (!interaction.guildId) throw new EconomyError("Server only.");
      const role = interaction.options.getRole("role");
      await prisma.guildSettings.upsert({
        where: { guildId: interaction.guildId },
        create: {
          guildId: interaction.guildId,
          arenaMasterRole: role?.id ?? null,
        },
        update: { arenaMasterRole: role ? role.id : null },
      });
      await interaction.reply({
        embeds: [
          successEmbed(
            "Arena Master updated",
            role
              ? `${role} can start/cancel Inferno Games.`
              : "Arena Master role cleared (host + Manage Messages only).",
          ),
        ],
      });
    }
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Admin command failed.";
    await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
  }
}
