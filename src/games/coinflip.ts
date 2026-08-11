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
import { animateInteraction } from "../services/animation.js";
import { claimSessionStatus } from "../services/expiry.js";
import {
  addToJackpot,
  applyRake,
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
import { flipCoin } from "../utils/random.js";

function spinFrames(choice: "heads" | "tails"): string[] {
  const frames = ["🌑", "🌒", "🌓", "🌔", "🌕", "🌖", "🌗", "🌘"];
  const label = choice === "heads" ? "HEADS" : "TAILS";
  return [
    `${theme.emojis.spin} HellCat coin whirls into the Inferno…`,
    `${frames[2]} Spinning for **${label}**…`,
    `${frames[5]} Fate tightens its grip…`,
  ];
}

export async function playCoinflipVsHouse(
  interaction: ChatInputCommandInteraction,
  amount: number,
  choice: "heads" | "tails",
) {
  assertBetAmount(amount);

  const spinning = baseEmbed(theme.colors.night)
    .setTitle(`${theme.emojis.spin} HellCat Spin`)
    .setDescription(spinFrames(choice)[0]!)
    .addFields(
      { name: "Wager", value: formatCoins(amount), inline: true },
      { name: "Your call", value: choice.toUpperCase(), inline: true },
    );
  await interaction.editReply({ embeds: [spinning] });

  try {
    await ensureUser(interaction.user.id, interaction.user.username);
    await debit(interaction.user.id, amount, "coinflip_bet");
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Could not place wager.";
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
    return;
  }

  const result = flipCoin();
  const won = result === choice;

  await animateInteraction(
    interaction,
    spinFrames(choice)
      .slice(1)
      .map((text) => ({
        embeds: [
          baseEmbed(theme.colors.night)
            .setTitle(`${theme.emojis.spin} HellCat Spin`)
            .setDescription(text)
            .addFields(
              { name: "Wager", value: formatCoins(amount), inline: true },
              { name: "Your call", value: choice.toUpperCase(), inline: true },
            ),
        ],
      })),
    500,
  );

  if (won) {
    const gross = amount * 2;
    const { net, rake } = applyRake(gross);
    await creditForced(interaction.user.id, net, "coinflip_win");
    await addToJackpot(rake);
    await recordMatchResult({
      winnerId: interaction.user.id,
      loserId: null,
      amountWon: Math.max(0, net - amount),
    });

    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.success)
          .setTitle(`${theme.emojis.fire} ${result.toUpperCase()} — You win!`)
          .setDescription(
            `The coin lands **${result}**. GreekBot pays **${formatCoins(net)}** (rake ${formatCoins(rake)} → jackpot).`,
          ),
      ],
    });
  } else {
    await addToJackpot(Math.floor(amount * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: interaction.user.id,
      amountWon: 0,
    });
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.danger)
          .setTitle(`${theme.emojis.skull} ${result.toUpperCase()} — Burned`)
          .setDescription(
            `The coin lands **${result}**. You lose **${formatCoins(amount)}**.`,
          ),
      ],
    });
  }
}

async function assertNoOpenDuel(userIds: string[]) {
  const active = await prisma.gameSession.findFirst({
    where: {
      status: { in: ["pending", "active"] },
      OR: userIds.flatMap((id) => [
        { playerOneId: id },
        { playerTwoId: id },
      ]),
    },
  });
  if (active) {
    throw new EconomyError("One of you already has an open duel. Finish or wait.");
  }
}

export async function challengeCoinflipPvP(
  interaction: ChatInputCommandInteraction,
  opponent: User,
  amount: number,
  choice: "heads" | "tails",
) {
  if (opponent.bot) throw new EconomyError("You cannot challenge bots.");
  if (opponent.id === interaction.user.id) {
    throw new EconomyError("Challenge another gladiator.");
  }
  assertBetAmount(amount);

  await ensureUser(interaction.user.id, interaction.user.username);
  await ensureUser(opponent.id, opponent.username);

  const [first, second] = [interaction.user.id, opponent.id].sort();
  const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);

  const session = await withUserLock(first, async () =>
    withUserLock(second, async () => {
      await assertNoOpenDuel([interaction.user.id, opponent.id]);
      await debitUnlocked(interaction.user.id, amount, "coinflip_pvp_escrow");
      try {
        return await prisma.gameSession.create({
          data: {
            type: "coinflip",
            status: "pending",
            wager: amount,
            playerOneId: interaction.user.id,
            playerTwoId: opponent.id,
            expiresAt,
            payload: JSON.stringify({ choice, mode: "pvp" }),
            channelId: interaction.channelId,
          },
        });
      } catch (err) {
        await creditForcedUnlocked(interaction.user.id, amount, "coinflip_refund_create_fail");
        throw err;
      }
    }),
  );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`cf:accept:${session.id}`)
      .setLabel("Accept duel")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`cf:decline:${session.id}`)
      .setLabel("Decline")
      .setStyle(ButtonStyle.Secondary),
  );

  const embed = baseEmbed(theme.colors.inferno)
    .setTitle(`${theme.emojis.swords} HellCat Spin Duel`)
    .setDescription(
      `${interaction.user} challenges ${opponent} for **${formatCoins(amount)}**.\n` +
        `Challenger called **${choice.toUpperCase()}**. Opponent takes the other side.\n` +
        `Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>.`,
    );

  await interaction.editReply({
    content: `${opponent}`,
    embeds: [embed],
    components: [row],
  });
  const msg = await interaction.fetchReply();
  await prisma.gameSession.update({
    where: { id: session.id },
    data: { messageId: msg.id },
  });
}

export async function handleCoinflipButton(interaction: ButtonInteraction) {
  const [, action, sessionId] = interaction.customId.split(":");
  if (!sessionId || !action) return;

  const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
  if (!session || session.type !== "coinflip" || session.status !== "pending") {
    await interaction.reply({
      embeds: [errorEmbed("This duel is no longer open.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (session.expiresAt && session.expiresAt.getTime() < Date.now()) {
    const claimed = await claimSessionStatus(session.id, "pending", "expired");
    if (claimed) {
      await creditForced(session.playerOneId, session.wager, "coinflip_refund_expired", session.id);
    }
    await interaction.update({
      embeds: [errorEmbed("Duel expired. Wager refunded to challenger.")],
      components: [],
    });
    return;
  }

  if (action === "decline") {
    if (interaction.user.id !== session.playerTwoId && interaction.user.id !== session.playerOneId) {
      await interaction.reply({
        embeds: [errorEmbed("Only the challenged fighter can decline.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const claimed = await claimSessionStatus(session.id, "pending", "cancelled");
    if (!claimed) {
      await interaction.reply({
        embeds: [errorEmbed("This duel is no longer open.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await creditForced(session.playerOneId, session.wager, "coinflip_refund_decline", session.id);
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle("Duel declined")
          .setDescription("The Inferno cools. Challenger refunded."),
      ],
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

    // Claim pending → active BEFORE debiting p2 so expire race can't refund+settle.
    const claimed = await claimSessionStatus(session.id, "pending", "active");
    if (!claimed) {
      await interaction.reply({
        embeds: [errorEmbed("This duel is no longer open.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    try {
      await debit(session.playerTwoId, session.wager, "coinflip_pvp_escrow", session.id);
    } catch (err) {
      // Refund p1 first, then cancel — so a failed credit leaves session active for sweep.
      try {
        await creditForced(session.playerOneId, session.wager, "coinflip_refund_accept_fail", session.id);
        await claimSessionStatus(session.id, "active", "cancelled");
      } catch (refundErr) {
        console.warn("[coinflip] accept-fail refund", session.id, refundErr);
      }
      const msg = err instanceof EconomyError ? err.message : "Could not lock wager.";
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }

    const payload = JSON.parse(session.payload) as { choice: "heads" | "tails" };
    const result = flipCoin();
    const p1Wins = result === payload.choice;
    const p1Side = payload.choice;
    const p2Side = payload.choice === "heads" ? "tails" : "heads";
    const pot = session.wager * 2;
    const winnerId = p1Wins ? session.playerOneId : session.playerTwoId!;
    const loserId = p1Wins ? session.playerTwoId! : session.playerOneId;

    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.night)
          .setTitle(`${theme.emojis.spin} Duel spinning…`)
          .setDescription("The HellCat coin hangs in the air…"),
      ],
      components: [],
    });

    await new Promise((r) => setTimeout(r, 900));

    const settled = await claimSessionStatus(session.id, "active", "settled");
    if (!settled) {
      try {
        await creditForced(session.playerOneId, session.wager, "coinflip_refund_race", session.id);
        await creditForced(session.playerTwoId!, session.wager, "coinflip_refund_race", session.id);
      } catch (refundErr) {
        console.warn("[coinflip] settle-race refund", session.id, refundErr);
      }
      return;
    }

    try {
      await creditForced(winnerId, pot, "coinflip_pvp_win", session.id);
    } catch (err) {
      console.warn("[coinflip] payout failed, reverting settled", session.id, err);
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "settled" },
        data: { status: "active" },
      });
      throw err;
    }
    await recordMatchResult({ winnerId, loserId, amountWon: session.wager });
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { winnerId, payload: JSON.stringify({ ...payload, result }) },
    });

    const resultEmbed = baseEmbed(theme.colors.gold)
      .setTitle(`${theme.emojis.trophy} ${result.toUpperCase()}!`)
      .setDescription(
        `Coin lands **${result.toUpperCase()}**.\n` +
          `<@${session.playerOneId}> called **${p1Side.toUpperCase()}** · ` +
          `<@${session.playerTwoId}> had **${p2Side.toUpperCase()}**.\n\n` +
          `<@${winnerId}> takes the pot of **${formatCoins(pot)}**.\n` +
          `<@${loserId}> walks back into the smoke.`,
      );

    const resultPayload = { embeds: [resultEmbed], components: [] };
    try {
      const channel = interaction.channel;
      if (channel?.isTextBased() && session.messageId) {
        const duelMessage = await channel.messages.fetch(session.messageId).catch(() => null);
        if (duelMessage) {
          await duelMessage.edit(resultPayload);
          return;
        }
      }
      await interaction.editReply(resultPayload);
    } catch (err) {
      console.warn("[coinflip] result UI update failed", session.id, err);
    }
  }
}
