import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
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
import { formatCoins, sleep, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import {
  Card,
  draw,
  formatHand,
  freshDeck,
  handValue,
  isBlackjack,
} from "./cards.js";

type BjPayload = {
  deck: Card[];
  player: Card[];
  dealer: Card[];
  bet: number;
  userId: string;
  done?: boolean;
};

function bjButtons(sessionId: string, disabled = false) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:hit:${sessionId}`)
      .setLabel("Hit")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`bj:stand:${sessionId}`)
      .setLabel("Stand")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function tableEmbed(payload: BjPayload, hideDealer: boolean, title: string) {
  const pVal = handValue(payload.player);
  const dVal = hideDealer ? "?" : String(handValue(payload.dealer));
  return baseEmbed(theme.colors.inferno)
    .setTitle(`${theme.emojis.cards} ${title}`)
    .setDescription(
      `**Dealer** (${dVal})\n${formatHand(payload.dealer, hideDealer)}\n\n` +
        `**You** (${pVal})\n${formatHand(payload.player)}\n\n` +
        `Wager: **${formatCoins(payload.bet)}**`,
    );
}

async function finishBlackjack(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  sessionId: string,
  payload: BjPayload,
  outcome: "win" | "lose" | "push" | "blackjack" | "bust",
  mode: "update" | "edit",
) {
  // Claim settlement first — prevents double payout on double-click.
  const claimed = await claimSessionStatus(sessionId, "active", "settled");
  if (!claimed) {
    if (interaction.isButton() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({
        embeds: [errorEmbed("This hand is already settled.")],
        flags: MessageFlags.Ephemeral,
      });
    }
    return;
  }

  let desc = "";
  let color: number = theme.colors.muted;

  if (outcome === "blackjack") {
    const gross = Math.floor(payload.bet * 2.5);
    const { net, rake } = applyRake(gross);
    try {
      await creditForced(payload.userId, net, "bj_blackjack", sessionId);
    } catch (err) {
      await prisma.gameSession.updateMany({
        where: { id: sessionId, status: "settled" },
        data: { status: "active" },
      });
      throw err;
    }
    await addToJackpot(rake);
    await recordMatchResult({
      winnerId: payload.userId,
      loserId: null,
      amountWon: net - payload.bet,
    });
    desc = `Blackjack! GreekBot pays **${formatCoins(net)}**.`;
    color = theme.colors.gold;
  } else if (outcome === "win") {
    const gross = payload.bet * 2;
    const { net, rake } = applyRake(gross);
    try {
      await creditForced(payload.userId, net, "bj_win", sessionId);
    } catch (err) {
      await prisma.gameSession.updateMany({
        where: { id: sessionId, status: "settled" },
        data: { status: "active" },
      });
      throw err;
    }
    await addToJackpot(rake);
    await recordMatchResult({
      winnerId: payload.userId,
      loserId: null,
      amountWon: net - payload.bet,
    });
    desc = `You win **${formatCoins(net)}**.`;
    const dVal = handValue(payload.dealer);
    const pVal = handValue(payload.player);
    desc =
      dVal > 21
        ? `Dealer busts at **${dVal}**! You win **${formatCoins(net)}** with **${pVal}**.`
        : `You win **${formatCoins(net)}** (**${pVal}** vs dealer **${dVal}**).`;
    color = theme.colors.success;
  } else if (outcome === "push") {
    try {
      await creditForced(payload.userId, payload.bet, "bj_push", sessionId);
    } catch (err) {
      await prisma.gameSession.updateMany({
        where: { id: sessionId, status: "settled" },
        data: { status: "active" },
      });
      throw err;
    }
    desc = `Push — wager of **${formatCoins(payload.bet)}** returned.`;
    color = theme.colors.muted;
  } else if (outcome === "bust") {
    await addToJackpot(Math.floor(payload.bet * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: payload.userId,
      amountWon: 0,
    });
    desc = `You bust at **${handValue(payload.player)}**! You lose **${formatCoins(payload.bet)}**.`;
    color = theme.colors.danger;
  } else {
    await addToJackpot(Math.floor(payload.bet * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: payload.userId,
      amountWon: 0,
    });
    desc = `Dealer **${handValue(payload.dealer)}** beats your **${handValue(payload.player)}**. You lose **${formatCoins(payload.bet)}**.`;
    color = theme.colors.danger;
  }

  payload.done = true;
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: {
      payload: JSON.stringify(payload),
      winnerId:
        outcome === "lose" || outcome === "push" || outcome === "bust"
          ? null
          : payload.userId,
    },
  });

  const embed = tableEmbed(payload, false, "Blackjack — Final")
    .setColor(color)
    .addFields({ name: "Result", value: desc });

  if (mode === "update" && interaction.isButton()) {
    await interaction.update({ embeds: [embed], components: [] });
  } else {
    await interaction.editReply({ embeds: [embed], components: [] });
  }
}

async function dealerPlay(payload: BjPayload) {
  while (handValue(payload.dealer) < 17) {
    payload.dealer.push(draw(payload.deck));
  }
}

/** Cancel an open blackjack hand and refund the wager. */
export async function cancelBlackjackSession(
  sessionId: string,
  userId: string,
): Promise<{ refunded: number } | null> {
  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "blackjack") return null;
  if (session.playerOneId !== userId) return null;
  if (session.status !== "active") return null;

  const claimed = await claimSessionStatus(sessionId, "active", "cancelled");
  if (!claimed) return null;

  await creditForced(userId, session.wager, "bj_refund_close", sessionId);
  return { refunded: session.wager };
}

function replaceBjRow(sessionId: string, amount: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj:reopen:${sessionId}:${amount}`)
      .setLabel("Close previous & deal")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`bj:close:${sessionId}`)
      .setLabel("Just close previous")
      .setStyle(ButtonStyle.Secondary),
  );
}

async function dealBlackjackTable(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  amount: number,
) {
  await ensureUser(interaction.user.id, interaction.user.username);

  const session = await withUserLock(interaction.user.id, async () => {
    const existing = await prisma.gameSession.findFirst({
      where: {
        type: "blackjack",
        status: "active",
        playerOneId: interaction.user.id,
      },
    });
    if (existing) {
      throw new EconomyError("OPEN_HAND");
    }

    await debitUnlocked(interaction.user.id, amount, "bj_bet");

    const deck = freshDeck();
    const payload: BjPayload = {
      deck,
      player: [draw(deck), draw(deck)],
      dealer: [draw(deck), draw(deck)],
      bet: amount,
      userId: interaction.user.id,
    };

    try {
      return await prisma.gameSession.create({
        data: {
          type: "blackjack",
          status: "active",
          wager: amount,
          playerOneId: interaction.user.id,
          payload: JSON.stringify(payload),
          channelId: interaction.channelId,
        },
      });
    } catch (err) {
      await creditForcedUnlocked(interaction.user.id, amount, "bj_refund_create_fail");
      throw err;
    }
  });

  const payload = JSON.parse(session.payload) as BjPayload;
  const playerBj = isBlackjack(payload.player);
  const dealerBj = isBlackjack(payload.dealer);

  await sleep(500);

  if (playerBj || dealerBj) {
    let outcome: "win" | "lose" | "push" | "blackjack" = "push";
    if (playerBj && dealerBj) outcome = "push";
    else if (playerBj) outcome = "blackjack";
    else outcome = "lose";
    await finishBlackjack(interaction, session.id, payload, outcome, "edit");
    return;
  }

  const msg = await interaction.editReply({
    embeds: [tableEmbed(payload, true, "Blackjack vs Cerberus")],
    components: [bjButtons(session.id)],
  });

  await prisma.gameSession.update({
    where: { id: session.id },
    data: { messageId: msg.id, payload: JSON.stringify(payload) },
  });
}

export async function startBlackjack(
  interaction: ChatInputCommandInteraction,
  amount: number,
) {
  assertBetAmount(amount);
  await ensureUser(interaction.user.id, interaction.user.username);

  const existing = await prisma.gameSession.findFirst({
    where: {
      type: "blackjack",
      status: "active",
      playerOneId: interaction.user.id,
    },
  });

  if (existing) {
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle(`${theme.emojis.cards} Hand already open`)
          .setDescription(
            `You still have an unfinished blackjack for **${formatCoins(existing.wager)}**.\n` +
              `Close it to deal a new hand for **${formatCoins(amount)}**.`,
          ),
      ],
      components: [replaceBjRow(existing.id, amount)],
    });
    return;
  }

  await interaction.editReply({
    embeds: [
      baseEmbed(theme.colors.night)
        .setTitle(`${theme.emojis.cards} Dealing…`)
        .setDescription("Cards slide across the Inferno table…"),
    ],
  });

  await dealBlackjackTable(interaction, amount);
}

export async function handleBlackjackButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const sessionId = parts[2];
  if (!sessionId || !action) return;

  if (action === "close" || action === "reopen") {
    const amount = action === "reopen" ? Number(parts[3]) : 0;
    if (action === "reopen") {
      try {
        assertBetAmount(amount);
      } catch (err) {
        const msg = err instanceof EconomyError ? err.message : "Invalid wager.";
        await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
        return;
      }
    }

    try {
      const result = await cancelBlackjackSession(sessionId, interaction.user.id);
      if (!result) {
        await interaction.reply({
          embeds: [errorEmbed("That hand is already closed.")],
          flags: MessageFlags.Ephemeral,
        });
        return;
      }

      if (action === "close") {
        await interaction.update({
          embeds: [
            baseEmbed(theme.colors.muted)
              .setTitle("Hand closed")
              .setDescription(
                `Previous wager of **${formatCoins(result.refunded)}** refunded.\nRun \`/blackjack\` when you're ready.`,
              ),
          ],
          components: [],
        });
        return;
      }

      await interaction.update({
        embeds: [
          baseEmbed(theme.colors.night)
            .setTitle(`${theme.emojis.cards} Dealing…`)
            .setDescription(
              `Closed previous hand (**${formatCoins(result.refunded)}** refunded).\nDealing new cards…`,
            ),
        ],
        components: [],
      });
      await dealBlackjackTable(interaction, amount);
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Could not close hand.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "blackjack" || session.status !== "active") {
    await interaction.reply({
      embeds: [errorEmbed("This hand is already settled.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.user.id !== session.playerOneId) {
    await interaction.reply({
      embeds: [errorEmbed("This is not your table.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const payload = JSON.parse(session.payload) as BjPayload;

  if (action === "hit") {
    await withUserLock(interaction.user.id, async () => {
      const fresh = await prisma.gameSession.findUnique({ where: { id: session.id } });
      if (!fresh || fresh.status !== "active") {
        throw new EconomyError("This hand is already settled.");
      }
      const live = JSON.parse(fresh.payload) as BjPayload;
      live.player.push(draw(live.deck));
      const value = handValue(live.player);

      if (value > 21) {
        const cas = await prisma.gameSession.updateMany({
          where: { id: session.id, status: "active", payload: fresh.payload },
          data: { payload: JSON.stringify(live) },
        });
        if (cas.count !== 1) throw new EconomyError("Hand changed — try again.");
        Object.assign(payload, live);
        return "bust" as const;
      }

      const cas = await prisma.gameSession.updateMany({
        where: { id: session.id, status: "active", payload: fresh.payload },
        data: { payload: JSON.stringify(live) },
      });
      if (cas.count !== 1) throw new EconomyError("Hand changed — try again.");
      Object.assign(payload, live);
      return "ok" as const;
    })
      .then(async (hitResult) => {
        if (hitResult === "bust") {
          await finishBlackjack(interaction, session.id, payload, "bust", "update");
          return;
        }
        await interaction.update({
          embeds: [tableEmbed(payload, true, "Blackjack vs Cerberus")],
          components: [bjButtons(session.id)],
        });
      })
      .catch(async (err) => {
        const msg = err instanceof EconomyError ? err.message : "Hit failed.";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
        }
      });
    return;
  }

  if (action === "stand") {
    try {
      // Persist dealer play under the lock, then settle AFTER release.
      // finishBlackjack → creditForced also takes withUserLock — nesting deadlocks.
      const settled = await withUserLock(interaction.user.id, async () => {
        const fresh = await prisma.gameSession.findUnique({ where: { id: session.id } });
        if (!fresh || fresh.status !== "active") {
          throw new EconomyError("This hand is already settled.");
        }
        const live = JSON.parse(fresh.payload) as BjPayload;
        await dealerPlay(live);

        const cas = await prisma.gameSession.updateMany({
          where: { id: session.id, status: "active", payload: fresh.payload },
          data: { payload: JSON.stringify(live) },
        });
        if (cas.count !== 1) throw new EconomyError("Hand changed — try again.");

        const p = handValue(live.player);
        const d = handValue(live.dealer);
        let outcome: "win" | "lose" | "push" | "blackjack" = "lose";
        if (d > 21 || p > d) outcome = "win";
        else if (p === d) outcome = "push";

        return { live, outcome };
      });

      await interaction.update({
        embeds: [tableEmbed(settled.live, false, "Dealer reveals…")],
        components: [],
      });
      await sleep(600);
      await finishBlackjack(interaction, session.id, settled.live, settled.outcome, "edit");
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Stand failed.";
      if (interaction.replied || interaction.deferred) {
        await interaction
          .followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      } else {
        await interaction
          .reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      }
    }
  }
}
