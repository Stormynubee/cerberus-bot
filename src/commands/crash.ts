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
import { claimSessionStatus } from "../services/expiry.js";
import {
  addToJackpot,
  applyRake,
  assertBetAmount,
  creditForced,
  debit,
  EconomyError,
  ensureUser,
  recordMatchResult,
} from "../services/wallet.js";
import { maybeAnnounceBigWin } from "../services/bigwin.js";
import { formatCoins, sleep, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";

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
  const r = Math.random();
  if (r < 0.03) return 1.0;
  return Math.max(1.0, Math.floor((0.99 / (1 - r)) * 100) / 100);
}

/** Returns true if this caller owns the end of the round. */
function claimEnd(round: CrashRound): boolean {
  if (round.ended) return false;
  round.ended = true;
  return true;
}

export const data = new SlashCommandBuilder()
  .setName("crash")
  .setDescription("Inferno rocket crash — cash out before it explodes")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  try {
    assertBetAmount(amount);
    await ensureUser(interaction.user.id, interaction.user.username);

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

    await debit(interaction.user.id, amount, "crash_bet");
    const crashAt = crashPoint();

    const session = await prisma.gameSession.create({
      data: {
        type: "crash",
        status: "active",
        wager: amount,
        playerOneId: interaction.user.id,
        payload: JSON.stringify({ crashAt }),
        channelId: interaction.channelId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });

    const roundId = session.id;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`crash:out:${roundId}`)
        .setLabel("Cash Out")
        .setStyle(ButtonStyle.Success),
    );

    await interaction.reply({
      embeds: [
        baseEmbed(theme.colors.inferno)
          .setTitle("🚀 Inferno Rocket")
          .setDescription(
            `Wager **${formatCoins(amount)}**\nMultiplier: **1.00x**\nCash out before it burns!`,
          ),
      ],
      components: [row],
    });
    const msg = await interaction.fetchReply();
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { messageId: msg.id },
    });

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
      await sleep(700);
      const round = rounds.get(roundId);
      if (!round || round.ended) return;
      mult = Math.round((mult + 0.15) * 100) / 100;
      if (mult >= crashAt) break;
      round.multiplier = mult;
      await msg
        .edit({
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
    rounds.delete(roundId);

    const settled = await claimSessionStatus(session.id, "active", "settled");
    if (!settled) return;

    await addToJackpot(Math.floor(amount * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: interaction.user.id,
      amountWon: 0,
    });
    await msg.edit({
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
    const msg = err instanceof EconomyError ? err.message : "Crash failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
    }
  }
}

export async function handleCrashButton(interaction: ButtonInteraction) {
  const [, , roundId] = interaction.customId.split(":");
  if (!roundId) return;
  const round = rounds.get(roundId);
  if (!round || round.ended) {
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
  rounds.delete(roundId);

  const settled = await claimSessionStatus(round.sessionId, "active", "settled");
  if (!settled) {
    await interaction.reply({
      embeds: [errorEmbed("This rocket already finished.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
}
