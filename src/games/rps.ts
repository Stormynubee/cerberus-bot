import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  User,
} from "discord.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { withUserLock } from "../locks.js";
import { claimSessionStatus } from "../services/expiry.js";
import {
  assertBetAmount,
  creditForced,
  creditForcedUnlocked,
  debit,
  debitUnlocked,
  EconomyError,
  ensureUser,
  recordMatchResult,
} from "../services/wallet.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";

export type RpsChoice = "rock" | "paper" | "scissors";

const BEATS: Record<RpsChoice, RpsChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

const LABELS: Record<RpsChoice, string> = {
  rock: "🪨 Rock",
  paper: "📄 Paper",
  scissors: "✂️ Scissors",
};

function choiceRow(sessionId: string, prefix: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${prefix}:rock:${sessionId}`)
      .setLabel("Rock")
      .setEmoji("🪨")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}:paper:${sessionId}`)
      .setLabel("Paper")
      .setEmoji("📄")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${prefix}:scissors:${sessionId}`)
      .setLabel("Scissors")
      .setEmoji("✂️")
      .setStyle(ButtonStyle.Primary),
  );
}

/** Cancel pending/active RPS and refund escrowed wagers. */
export async function cancelRpsSession(
  sessionId: string,
  requesterId: string,
): Promise<{ refunded: string[] } | null> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "rps") return null;
  if (![session.playerOneId, session.playerTwoId].includes(requesterId)) return null;
  if (!["pending", "active"].includes(session.status)) return null;

  const from = session.status;
  const claimed = await claimSessionStatus(sessionId, from, "cancelled");
  if (!claimed) return null;

  const refunded: string[] = [];
  try {
    await creditForced(session.playerOneId, session.wager, "rps_refund_close", session.id);
    refunded.push(session.playerOneId);
    if (from === "active" && session.playerTwoId) {
      await creditForced(session.playerTwoId, session.wager, "rps_refund_close", session.id);
      refunded.push(session.playerTwoId);
    }
  } catch (err) {
    console.warn("[rps] close refund failed", sessionId, err);
    await prisma.gameSession.updateMany({
      where: { id: sessionId, status: "cancelled" },
      data: { status: from },
    });
    throw err;
  }
  return { refunded };
}

function replaceRpsRow(sessionId: string, opponentId: string, amount: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:reopen:${sessionId}:${opponentId}:${amount}`)
      .setLabel("Close mine & challenge")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`rps:close:${sessionId}`)
      .setLabel("Just close mine")
      .setStyle(ButtonStyle.Secondary),
  );
}

export async function challengeRps(
  interaction: ChatInputCommandInteraction,
  opponent: User,
  amount: number,
) {
  if (opponent.bot) throw new EconomyError("You cannot challenge bots.");
  if (opponent.id === interaction.user.id) {
    throw new EconomyError("Challenge another gladiator.");
  }
  assertBetAmount(amount);
  await ensureUser(interaction.user.id, interaction.user.username);
  await ensureUser(opponent.id, opponent.username);

  const mine = await prisma.gameSession.findFirst({
    where: {
      type: "rps",
      status: { in: ["pending", "active"] },
      OR: [{ playerOneId: interaction.user.id }, { playerTwoId: interaction.user.id }],
    },
  });
  if (mine) {
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle(`${theme.emojis.swords} Duel already open`)
          .setDescription(
            `You already have an open Rock–Paper–Scissors duel for **${formatCoins(mine.wager)}**.\n` +
              `Close it to challenge ${opponent} for **${formatCoins(amount)}**.`,
          ),
      ],
      components: [replaceRpsRow(mine.id, opponent.id, amount)],
    });
    return;
  }

  const theirs = await prisma.gameSession.findFirst({
    where: {
      type: "rps",
      status: { in: ["pending", "active"] },
      OR: [{ playerOneId: opponent.id }, { playerTwoId: opponent.id }],
    },
  });
  if (theirs) {
    throw new EconomyError(
      `${opponent.username} already has an open duel. Ask them to finish or close it first.`,
    );
  }

  await createRpsChallenge(interaction, opponent, amount);
}

async function createRpsChallenge(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  opponent: User,
  amount: number,
) {
  const [first, second] = [interaction.user.id, opponent.id].sort();
  const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);

  const session = await withUserLock(first, async () =>
    withUserLock(second, async () => {
      const active = await prisma.gameSession.findFirst({
        where: {
          status: { in: ["pending", "active"] },
          OR: [
            { playerOneId: interaction.user.id },
            { playerTwoId: interaction.user.id },
            { playerOneId: opponent.id },
            { playerTwoId: opponent.id },
          ],
        },
      });
      if (active) throw new EconomyError("One of you already has an open duel.");

      await debitUnlocked(interaction.user.id, amount, "rps_escrow");
      try {
        return await prisma.gameSession.create({
          data: {
            type: "rps",
            status: "pending",
            wager: amount,
            playerOneId: interaction.user.id,
            playerTwoId: opponent.id,
            expiresAt,
            payload: JSON.stringify({ p1: null, p2: null }),
            channelId: interaction.channelId,
          },
        });
      } catch (err) {
        await creditForcedUnlocked(interaction.user.id, amount, "rps_refund_create_fail");
        throw err;
      }
    }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`rps:accept:${session.id}`)
      .setLabel("Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`rps:decline:${session.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({
    content: `${opponent}`,
    embeds: [
      baseEmbed(theme.colors.inferno)
        .setTitle(`${theme.emojis.swords} Arena — Rock Paper Scissors`)
        .setDescription(
          `${interaction.user} challenges ${opponent} for **${formatCoins(amount)}**.\n` +
            `Fair Rock / Paper / Scissors — winner takes both escrows (no house rake).\n` +
            `Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>.`,
        ),
    ],
    components: [row],
  });
  const msg = await interaction.fetchReply();
  await prisma.gameSession.update({
    where: { id: session.id },
    data: { messageId: msg.id },
  });
}

async function settleRps(
  sessionId: string,
  p1: RpsChoice,
  p2: RpsChoice,
  interaction: ButtonInteraction,
) {
  const claimed = await claimSessionStatus(sessionId, "active", "settled");
  if (!claimed) return;

  const session = await prisma.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
  const pot = session.wager * 2;

  let winnerId: string | null = null;
  let loserId: string | null = null;
  let resultText: string;

  try {
    if (p1 === p2) {
      await creditForced(session.playerOneId, session.wager, "rps_tie_refund", session.id);
      await creditForced(session.playerTwoId!, session.wager, "rps_tie_refund", session.id);
      await recordMatchResult({
        winnerId: null,
        loserId: null,
        amountWon: 0,
        tieIds: [session.playerOneId, session.playerTwoId!],
      });
      resultText = `It's a tie — both threw ${LABELS[p1]}. Wagers returned.`;
    } else if (BEATS[p1] === p2) {
      winnerId = session.playerOneId;
      loserId = session.playerTwoId!;
      await creditForced(winnerId, pot, "rps_win", session.id);
      await recordMatchResult({ winnerId, loserId, amountWon: session.wager });
      resultText = `<@${winnerId}> wins with ${LABELS[p1]} vs ${LABELS[p2]} and takes **${formatCoins(pot)}**!`;
    } else {
      winnerId = session.playerTwoId!;
      loserId = session.playerOneId;
      await creditForced(winnerId, pot, "rps_win", session.id);
      await recordMatchResult({ winnerId, loserId, amountWon: session.wager });
      resultText = `<@${winnerId}> wins with ${LABELS[p2]} vs ${LABELS[p1]} and takes **${formatCoins(pot)}**!`;
    }
  } catch (err) {
    console.warn("[rps] payout failed, reverting settled", sessionId, err);
    await prisma.gameSession.updateMany({
      where: { id: sessionId, status: "settled" },
      data: { status: "active" },
    });
    throw err;
  }

  await prisma.gameSession.update({
    where: { id: session.id },
    data: { winnerId, payload: JSON.stringify({ p1, p2 }) },
  });

  const resultEmbed = baseEmbed(winnerId ? theme.colors.gold : theme.colors.muted)
    .setTitle(`${theme.emojis.trophy} Arena Result`)
    .setDescription(
      `⚔️ <@${session.playerOneId}> ${LABELS[p1]}  vs  <@${session.playerTwoId}> ${LABELS[p2]}\n\n${resultText}`,
    );

  const resultPayload = { embeds: [resultEmbed], components: [] };

  try {
    // Prefer interaction.update (works on the public duel message). message.edit after
    // an ephemeral reply can fail with Missing Access on some channels/deployments.
    if (!interaction.replied && !interaction.deferred) {
      await interaction.update(resultPayload);
      return;
    }

    const channel = interaction.channel;
    if (channel?.isTextBased() && session.messageId) {
      const duelMessage = await channel.messages.fetch(session.messageId).catch(() => null);
      if (duelMessage) {
        await duelMessage.edit(resultPayload);
        return;
      }
    }

    if (interaction.message?.editable) {
      await interaction.message.edit(resultPayload);
    }
  } catch (err) {
    console.warn("[rps] result UI update failed", sessionId, err);
  }
}

export async function handleRpsButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const sessionId = parts[2];
  if (!action || !sessionId) return;

  if (action === "close" || action === "reopen") {
    const opponentId = action === "reopen" ? parts[3] : undefined;
    const amount = action === "reopen" ? Number(parts[4]) : 0;

    try {
      const closed = await cancelRpsSession(sessionId, interaction.user.id);
      if (!closed) {
        await interaction.reply({
          embeds: [errorEmbed("That duel is already closed.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === "close") {
        await interaction.update({
          embeds: [
            baseEmbed(theme.colors.muted)
              .setTitle("Duel closed")
              .setDescription("Escrowed wagers refunded. Run `/rps` when you're ready."),
          ],
          components: [],
        });
        return;
      }

      assertBetAmount(amount);
      if (!opponentId) throw new EconomyError("Missing opponent.");
      const opponent = await interaction.client.users.fetch(opponentId);
      await ensureUser(opponent.id, opponent.username);
      await interaction.update({
        embeds: [
          baseEmbed(theme.colors.night)
            .setTitle("Opening new duel…")
            .setDescription(`Previous duel closed. Challenging ${opponent}…`),
        ],
        components: [],
      });
      await createRpsChallenge(interaction, opponent, amount);
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Could not close duel.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "rps") {
    await interaction.reply({
      embeds: [errorEmbed("Duel not found.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.expiresAt && session.expiresAt.getTime() < Date.now() && session.status === "pending") {
    const claimed = await claimSessionStatus(session.id, "pending", "expired");
    if (claimed) {
      await creditForced(session.playerOneId, session.wager, "rps_refund_expired", session.id);
    }
    await interaction.update({
      embeds: [errorEmbed("Duel expired. Challenger refunded.")],
      components: [],
    });
    return;
  }

  if (action === "decline") {
    if (![session.playerOneId, session.playerTwoId].includes(interaction.user.id)) {
      await interaction.reply({
        embeds: [errorEmbed("Not your duel.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const claimed = await claimSessionStatus(session.id, "pending", "cancelled");
    if (!claimed) {
      await interaction.reply({
        embeds: [errorEmbed("Too late to decline.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await creditForced(session.playerOneId, session.wager, "rps_refund_decline", session.id);
    await interaction.update({
      embeds: [baseEmbed(theme.colors.muted).setTitle("Duel declined").setDescription("Wager refunded.")],
      components: [],
    });
    return;
  }

  if (action === "accept") {
    if (interaction.user.id !== session.playerTwoId) {
      await interaction.reply({
        embeds: [errorEmbed("Only the challenged fighter can accept.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const claimed = await claimSessionStatus(session.id, "pending", "active");
    if (!claimed) {
      await interaction.reply({
        embeds: [errorEmbed("Duel already started or closed.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await debit(session.playerTwoId, session.wager, "rps_escrow", session.id);
    } catch (err) {
      try {
        await creditForced(session.playerOneId, session.wager, "rps_refund_accept_fail", session.id);
        await claimSessionStatus(session.id, "active", "cancelled");
      } catch (refundErr) {
        console.warn("[rps] accept-fail refund", session.id, refundErr);
      }
      const msg = err instanceof EconomyError ? err.message : "Could not lock wager.";
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }

    // Extend abandonment window from accept time
    await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        expiresAt: new Date(Date.now() + config.challengeTtlSeconds * 3 * 1000),
      },
    });

    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.night)
          .setTitle(`${theme.emojis.swords} Choose your weapon`)
          .setDescription(
            `Both fighters: pick Rock, Paper, or Scissors privately.\nPot: **${formatCoins(session.wager * 2)}**`,
          ),
      ],
      components: [choiceRow(session.id, "rpspick")],
    });
  }
}

export async function handleRpsPickButton(interaction: ButtonInteraction) {
  const [, choiceRaw, sessionId] = interaction.customId.split(":");
  const choice = choiceRaw as RpsChoice;
  if (!sessionId || !["rock", "paper", "scissors"].includes(choice)) return;

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "rps" || session.status !== "active") {
    await interaction.reply({
      embeds: [errorEmbed("This arena bout is closed.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const isP1 = interaction.user.id === session.playerOneId;
  const isP2 = interaction.user.id === session.playerTwoId;
  if (!isP1 && !isP2) {
    await interaction.reply({
      embeds: [errorEmbed("Spectators cannot throw.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  // Compare-and-swap on payload so concurrent picks cannot overwrite each other.
  const result = await prisma.$transaction(async (tx) => {
    const fresh = await tx.gameSession.findUnique({ where: { id: sessionId } });
    if (!fresh || fresh.status !== "active") return null;
    const payload = JSON.parse(fresh.payload) as { p1: RpsChoice | null; p2: RpsChoice | null };
    if (isP1) {
      if (payload.p1) return { error: "already" as const };
      payload.p1 = choice;
    } else {
      if (payload.p2) return { error: "already" as const };
      payload.p2 = choice;
    }
    const cas = await tx.gameSession.updateMany({
      where: { id: sessionId, status: "active", payload: fresh.payload },
      data: { payload: JSON.stringify(payload) },
    });
    if (cas.count !== 1) return { error: "race" as const };
    return { payload };
  });

  if (!result) {
    await interaction.reply({
      embeds: [errorEmbed("This arena bout is closed.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if ("error" in result) {
    await interaction.reply({
      embeds: [
        errorEmbed(
          result.error === "race"
            ? "Pick collided — tap again."
            : "You already locked your throw.",
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (result.payload.p1 && result.payload.p2) {
    await settleRps(session.id, result.payload.p1, result.payload.p2, interaction);
    const lockedEmbed = baseEmbed(theme.colors.success)
      .setTitle("Throw locked")
      .setDescription(`You chose **${LABELS[choice]}**. Arena resolved.`);
    if (interaction.isRepliable()) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [lockedEmbed], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [lockedEmbed], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  await interaction.reply({
    embeds: [
      baseEmbed(theme.colors.success)
        .setTitle("Throw locked")
        .setDescription(`You chose **${LABELS[choice]}**. Waiting for opponent…`),
    ],
    flags: MessageFlags.Ephemeral,
  });
}
