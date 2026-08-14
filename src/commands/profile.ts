import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../db.js";
import { ensureUser, getBalance } from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";

export const data = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View HellCatCoins combat stats and recent history")
  .addUserOption((o) => o.setName("user").setDescription("Whose profile to view"));

const REASON_LABEL: Record<string, string> = {
  coinflip_win: "Coinflip win",
  coinflip_bet: "Coinflip bet",
  coinflip_pvp_win: "Coinflip duel win",
  coinflip_pvp_escrow: "Coinflip duel escrow",
  rps_win: "RPS win",
  rps_escrow: "RPS escrow",
  rps_tie_refund: "RPS tie refund",
  bj_win: "Blackjack win",
  bj_blackjack: "Blackjack natural",
  bj_bet: "Blackjack bet",
  bj_push: "Blackjack push",
  slots_win: "Slots win",
  slots_bet: "Slots bet",
  roulette_win: "Roulette win",
  roulette_bet: "Roulette bet",
  crash_cashout: "Crash cashout",
  crash_bet: "Crash bet",
  highlow_cashout: "High-Low cashout",
  highlow_bet: "High-Low bet",
  daily_claim: "Daily claim",
  hg_prize: "Inferno Games prize",
  hg_entry: "Inferno Games entry",
  hg_seed_prize: "Inferno Games host seed",
  hg_revive: "Inferno Games revive",
};

function labelReason(reason: string): string {
  if (REASON_LABEL[reason]) return REASON_LABEL[reason];
  if (reason.startsWith("admin_")) return "Admin adjustment";
  if (reason.includes("refund")) return "Refund";
  return reason.replace(/_/g, " ");
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser("user") ?? interaction.user;
  await ackCommand(interaction);

  try {
    await ensureUser(target.id, target.username);
    const u = await getBalance(target.id, target.username);

    const played = u.wins + u.losses + u.ties;
    const winRate = played === 0 ? "0%" : `${Math.round((u.wins / played) * 100)}%`;

    const recent = await prisma.ledgerEntry.findMany({
      where: { userId: target.id },
      orderBy: { createdAt: "desc" },
      take: 8,
    });

    const settled = await prisma.gameSession.findMany({
      where: {
        status: "settled",
        OR: [{ playerOneId: target.id }, { playerTwoId: target.id }],
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    const historyLines =
      recent.length === 0
        ? "_No ledger yet — play a game or claim `/daily`._"
        : recent
            .map((e) => {
              const sign = e.delta >= 0 ? "+" : "";
              const when = `<t:${Math.floor(e.createdAt.getTime() / 1000)}:R>`;
              return `${when} · **${sign}${e.delta.toLocaleString("en-US")}** · ${labelReason(e.reason)}`;
            })
            .join("\n");

    const matchLines =
      settled.length === 0
        ? "_No settled matches yet._"
        : settled
            .map((s) => {
              const won = s.winnerId === target.id;
              const result = s.winnerId == null ? "push/house" : won ? "WIN" : "LOSS";
              const when = `<t:${Math.floor(s.updatedAt.getTime() / 1000)}:R>`;
              return `${when} · \`${s.type}\` · **${result}** · wager ${formatCoins(s.wager)}`;
            })
            .join("\n");

    const embed = baseEmbed(theme.colors.inferno)
      .setAuthor({
        name: `${target.displayName}'s Inferno Record`,
        iconURL: target.displayAvatarURL({ size: 64 }),
      })
      .setDescription(
        [
          `**Balance** · ${formatCoins(u.balance)}${u.frozen ? " · ❄️ *frozen*" : ""}`,
          `**Record** · ${u.wins}W · ${u.losses}L · ${u.ties}T · **${winRate}** (${played} games)`,
          `**Streaks** · daily ${u.dailyStreak} · win ${u.currentStreak} (best ${u.bestStreak})`,
          `**Biggest win** · ${formatCoins(u.biggestWin)}`,
        ].join("\n"),
      )
      .addFields(
        {
          name: "Recent matches",
          value: matchLines.slice(0, 1020),
        },
        {
          name: "Wallet history",
          value: historyLines.slice(0, 1020),
        },
      )
      .setThumbnail(target.displayAvatarURL({ size: 256 }));

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[profile]", err);
    await interaction.editReply({
      embeds: [errorEmbed("Could not load profile. Try again.")],
    });
  }
}
