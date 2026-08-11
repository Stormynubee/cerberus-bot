import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { prisma } from "../db.js";
import { withUserLock } from "../locks.js";
import { claimSessionStatus } from "../services/expiry.js";
import {
  addToJackpot,
  applyRake,
  assertBetAmount,
  creditForced,
  creditForcedUnlocked,
  debitUnlocked,
  EconomyError,
  ensureUser,
  recordMatchResult,
} from "../services/wallet.js";
import { maybeAnnounceBigWin } from "../services/bigwin.js";
import { formatCoins, sleep, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";
import { randomFloat } from "../utils/random.js";

const TICK_MS = 700;
const MULT_STEP = 0.15;
/** Cap so round length (and expiresAt) stay bounded. */
const CRASH_CAP = 100;
const EXPIRY_GRACE_MS = 90_000;

type CrashRound = {
  sessionId: string;
  userId: string;
  bet: number;
  crashAt: number;
  /** Sync claim flag — must be set before any await when ending. */
  ended: boolean;
  multiplier: number;
};

const rounds = new Map<string, CrashRound>();

function crashPoint(): number {
  const r = randomFloat();
  if (r < 0.03) return 1.0;
  const raw = Math.max(1.0, Math.floor((0.99 / (1 - r)) * 100) / 100);
  return Math.min(CRASH_CAP, raw);
}

/** Wall-clock budget for the climb loop + grace so expiry cannot refund mid-flight. */
export function crashExpiresAt(crashAt: number, fromMs = Date.now()): Date {
  const steps = crashAt <= 1 ? 0 : Math.ceil((crashAt - 1) / MULT_STEP);
  return new Date(fromMs + steps * TICK_MS + EXPIRY_GRACE_MS);
}

/** Returns true if this caller owns the end of the round. */
function claimEnd(round: CrashRound): boolean {
  if (round.ended) return false;
  round.ended = true;
  return true;
}

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Inferno rocket — ~1% house edge; 3% chance of instant 1.00x bust")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  try {
    assertBetAmount(amount);
    await ackCommand(interaction);
    await ensureUser(interaction.user.id, interaction.user.username);

    const session = await withUserLock(interaction.user.id, async () => {
      for (const r of rounds.values()) {
        if (r.userId === interaction.user.id && !r.ended) {
          throw new EconomyError("Finish your current crash round first.");
        }
      }

      const existing = await prisma.gameSession.findFirst({
        where: {
          type: "crash",
          status: "active",
          playerOneId: interaction.user.id,
        },
      });
      if (existing) throw new EconomyError("Finish your current crash round first.");

      await debitUnlocked(interaction.user.id, amount, "crash_bet");
      const crashAt = crashPoint();

      try {
        return await prisma.gameSession.create({
          data: {
            type: "crash",
            status: "active",
            wager: amount,
            playerOneId: interaction.user.id,
            payload: JSON.stringify({ crashAt }),
            channelId: interaction.channelId,
            expiresAt: crashExpiresAt(crashAt),
          },
        });
      } catch (err) {
        await creditForcedUnlocked(interaction.user.id, amount, "crash_refund_create_fail");
        throw err;
      }
    });

    const payload = JSON.parse(session.payload) as { crashAt: number };
    const crashAt = payload.crashAt;
    const roundId = session.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash:out:${roundId}`)
        .setLabel("Cash Out")
        .setStyle(ButtonStyle.Success),
    );

    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.inferno)
          .setTitle("🚀 Inferno Rocket")
          .setDescription(
            `Wager **${formatCoins(amount)}**\nMultiplier: **1.00x**\nCash out before it burns!`,
          )
          .setFooter({
            text: "Fair crash curve · 3% instant 1.00x · ~1% edge · 2% rake on cashout",
          }),
      ],
      components: [row],
    });
    const msg = await interaction.fetchReply().catch(() => null);
    if (msg) {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { messageId: msg.id },
      });
    }

    rounds.set(roundId, {
      sessionId: session.id,
      userId: interaction.user.id,
      bet: amount,
      crashAt,
      ended: false,
      multiplier: 1,
    });

    let mult = 1.0;
    while (mult < crashAt) {
      await sleep(TICK_MS);
      const round = rounds.get(roundId);
      if (!round || round.ended) return;
      mult = Math.round((mult + MULT_STEP) * 100) / 100;
      if (mult >= crashAt) break;
      round.multiplier = mult;
      await interaction
        .editReply({
          embeds: [
            baseEmbed(theme.colors.inferno)
              .setTitle("🚀 Inferno Rocket")
              .setDescription(
                `Wager **${formatCoins(amount)}**\nMultiplier: **${mult.toFixed(2)}x**\nClimbing…`,
              ),
          ],
          components: [row],
        })
        .catch(() => undefined);
    }

    const round = rounds.get(roundId);
    if (!round || !claimEnd(round)) return;

    const settled = await claimSessionStatus(session.id, "active", "settled");
    if (!settled) {
      // Expiry or cashout already owns this session — do not revive the round.
      rounds.delete(roundId);
      return;
    }
    rounds.delete(roundId);

    await addToJackpot(Math.floor(amount * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: interaction.user.id,
      amountWon: 0,
    });
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.danger)
          .setTitle("💥 Rocket crashed!")
          .setDescription(
            `Crashed at **${crashAt.toFixed(2)}x**.\nYou lose **${formatCoins(amount)}**.`,
          ),
      ],
      components: [],
    });
  } catch (err) {
    console.error("[crash]", err);
    const msg = err instanceof EconomyError ? err.message : "Crash failed.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed(msg)] }).catch(async () => {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
    }
  }
}

export async function handleCrashButton(interaction: ButtonInteraction) {
  const [, , roundId] = interaction.customId.split(":");
  if (!roundId) return;

  let round = rounds.get(roundId);
  if (!round) {
    await refundOrphanCrash(interaction, roundId);
    return;
  }
  if (round.ended) {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== round.userId) {
    await interaction.reply({
      embeds: [errorEmbed("Not your rocket.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!claimEnd(round)) {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const settled = await claimSessionStatus(round.sessionId, "active", "settled");
  if (!settled) {
    rounds.delete(roundId);
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  rounds.delete(roundId);

  try {
    const gross = Math.floor(round.bet * round.multiplier);
    const { net, rake } = applyRake(gross);
    await creditForced(round.userId, net, "crash_cashout", round.sessionId);
    await addToJackpot(rake);
    await recordMatchResult({
      winnerId: round.userId,
      loserId: null,
      amountWon: net - round.bet,
    });

    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.success)
          .setTitle("🪂 Cashed out!")
          .setDescription(
            `Escaped at **${round.multiplier.toFixed(2)}x** for **${formatCoins(net)}**.`,
          ),
      ],
      components: [],
    });

    await maybeAnnounceBigWin(interaction, net - round.bet, "crash");
  } catch (err) {
    console.warn("[crash] cashout payout failed, reverting", round.sessionId, err);
    await prisma.gameSession.updateMany({
      where: { id: round.sessionId, status: "settled" },
      data: { status: "active" },
    });
    round.ended = false;
    rounds.set(roundId, round);
    throw err;
  }
}

/**
 * After a process restart the in-memory round is gone. Do not invent a multiplier —
 * refund the escrowed stake if the DB session is still active.
 */
async function refundOrphanCrash(interaction: ButtonInteraction, roundId: string) {
  const session = await prisma.gameSession.findUnique({ where: { id: roundId } });
  if (!session || session.type !== "crash") {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== session.playerOneId) {
    await interaction.reply({
      embeds: [errorEmbed("Not your rocket.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (session.status !== "active") {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const claimed = await claimSessionStatus(session.id, "active", "expired");
  if (!claimed) {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await creditForced(session.playerOneId, session.wager, "crash_refund_interrupted", session.id);
  } catch (err) {
    await prisma.gameSession.updateMany({
      where: { id: session.id, status: "expired" },
      data: { status: "active" },
    });
    throw err;
  }

  await interaction.update({
    embeds: [
      baseEmbed(theme.colors.gold)
        .setTitle("Rocket interrupted")
        .setDescription(
          `The round was lost after a restart.\nStake refunded: **${formatCoins(session.wager)}**.`,
        ),
    ],
    components: [],
  });
}
