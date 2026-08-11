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
  Card,
  draw,
  formatCard,
  freshDeck,
  hiLoRankValue,
} from "../games/cards.js";
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
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";

type HiLoPayload = {
  bet: number;
  streak: number;
  pot: number;
  current: Card;
  deck: Card[];
};

export const data = new SlashCommandBuilder()
  .setName("highlow")
  .setDescription("High-Low card climb — ride the streak or cash out")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Starting wager").setRequired(true).setMinValue(1),
  );

function row(id: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`hl:high:${id}`).setLabel("Higher").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`hl:low:${id}`).setLabel("Lower").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`hl:cash:${id}`).setLabel("Cash Out").setStyle(ButtonStyle.Primary),
  );
}

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  try {
    assertBetAmount(amount);
    await ackCommand(interaction);
    await ensureUser(interaction.user.id, interaction.user.username);

    const session = await withUserLock(interaction.user.id, async () => {
      const existing = await prisma.gameSession.findFirst({
        where: {
          type: "highlow",
          status: "active",
          playerOneId: interaction.user.id,
        },
      });
      if (existing) throw new EconomyError("Finish your current High-Low run first.");

      await debitUnlocked(interaction.user.id, amount, "highlow_bet");
      const deck = freshDeck();
      const current = draw(deck);
      const payload: HiLoPayload = {
        bet: amount,
        streak: 0,
        pot: amount,
        current,
        deck,
      };

      try {
        return await prisma.gameSession.create({
          data: {
            type: "highlow",
            status: "active",
            wager: amount,
            playerOneId: interaction.user.id,
            payload: JSON.stringify(payload),
            channelId: interaction.channelId,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          },
        });
      } catch (err) {
        await creditForcedUnlocked(interaction.user.id, amount, "highlow_refund_create_fail");
        throw err;
      }
    });

    const payload = JSON.parse(session.payload) as HiLoPayload;
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.inferno)
          .setTitle("🃏 High-Low")
          .setDescription(
            `Card: ${formatCard(payload.current)} (rank ${hiLoRankValue(payload.current)})\n` +
              `Pot: **${formatCoins(amount)}** · Streak: **0**\n` +
              `Will the next card be higher or lower?`,
          ),
      ],
      components: [row(session.id)],
    });
    const msg = await interaction.fetchReply();
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { messageId: msg.id },
    });
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "High-Low failed.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed(msg)] }).catch(async () => {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
    }
  }
}

export async function handleHighLowButton(interaction: ButtonInteraction) {
  const [, action, id] = interaction.customId.split(":");
  if (!id || !action) return;

  const session = await prisma.gameSession.findUnique({ where: { id } });
  if (!session || session.type !== "highlow" || session.status !== "active") {
    await interaction.reply({
      embeds: [errorEmbed("Run expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== session.playerOneId) {
    await interaction.reply({
      embeds: [errorEmbed("Not your climb.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "cash") {
    const claimed = await claimSessionStatus(session.id, "active", "settled");
    if (!claimed) {
      await interaction.reply({
        embeds: [errorEmbed("Run already finished.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const payload = JSON.parse(session.payload) as HiLoPayload;
    try {
      const { net, rake } = applyRake(payload.pot);
      await creditForced(session.playerOneId, net, "highlow_cashout", session.id);
      await addToJackpot(rake);
      await recordMatchResult({
        winnerId: session.playerOneId,
        loserId: null,
        amountWon: net - payload.bet,
      });
      await interaction.update({
        embeds: [
          baseEmbed(theme.colors.success)
            .setTitle("Cashed out")
            .setDescription(`You leave with **${formatCoins(net)}** after ${payload.streak} climb(s).`),
        ],
        components: [],
      });
      await maybeAnnounceBigWin(interaction, net - payload.bet, "highlow");
    } catch (err) {
      await prisma.gameSession.updateMany({
        where: { id: session.id, status: "settled" },
        data: { status: "active" },
      });
      throw err;
    }
    return;
  }

  await withUserLock(session.playerOneId, async () => {
    const fresh = await prisma.gameSession.findUnique({ where: { id: session.id } });
    if (!fresh || fresh.status !== "active") {
      throw new EconomyError("Run expired.");
    }
    const payload = JSON.parse(fresh.payload) as HiLoPayload;
    const next = draw(payload.deck);
    const curVal = hiLoRankValue(payload.current);
    const nextVal = hiLoRankValue(next);
    const correct =
      action === "high" ? nextVal > curVal : action === "low" ? nextVal < curVal : false;
    const tie = nextVal === curVal;

    if (tie) {
      payload.current = next;
      const cas = await prisma.gameSession.updateMany({
        where: { id: session.id, status: "active", payload: fresh.payload },
        data: {
          payload: JSON.stringify(payload),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        },
      });
      if (cas.count !== 1) throw new EconomyError("Run changed — try again.");
      await interaction.update({
        embeds: [
          baseEmbed(theme.colors.muted)
            .setTitle("Push — same value")
            .setDescription(
              `${formatCard(payload.current)} → ${formatCard(next)}\nPot still **${formatCoins(payload.pot)}**. Go again.`,
            ),
        ],
        components: [row(session.id)],
      });
      return;
    }

    if (!correct) {
      const claimed = await claimSessionStatus(session.id, "active", "settled");
      if (!claimed) throw new EconomyError("Run already finished.");
      await addToJackpot(Math.floor(payload.bet * 0.02));
      await recordMatchResult({
        winnerId: null,
        loserId: session.playerOneId,
        amountWon: 0,
      });
      await interaction.update({
        embeds: [
          baseEmbed(theme.colors.danger)
            .setTitle("Climb broken")
            .setDescription(
              `${formatCard(payload.current)} → ${formatCard(next)}\nYou lose the pot of **${formatCoins(payload.pot)}**.`,
            ),
        ],
        components: [],
      });
      return;
    }

    payload.streak += 1;
    payload.pot = Math.floor(payload.pot * 1.45);
    payload.current = next;
    const cas = await prisma.gameSession.updateMany({
      where: { id: session.id, status: "active", payload: fresh.payload },
      data: {
        payload: JSON.stringify(payload),
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    if (cas.count !== 1) throw new EconomyError("Run changed — try again.");
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.success)
          .setTitle(`Climb ${payload.streak}!`)
          .setDescription(
            `${formatCard(next)} — correct!\nPot: **${formatCoins(payload.pot)}**\nHigher, lower, or cash out?`,
          ),
      ],
      components: [row(session.id)],
    });
  }).catch(async (err) => {
    const msg = err instanceof EconomyError ? err.message : "High-Low failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral }).catch(() => undefined);
    }
  });
}
