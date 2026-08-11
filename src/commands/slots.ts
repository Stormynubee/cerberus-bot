import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { animateInteraction } from "../services/animation.js";
import {
  abortHouseSpin,
  openHouseSpin,
  revertHouseSpinSettle,
  settleHouseSpin,
} from "../services/houseSession.js";
import {
  addToJackpot,
  applyRake,
  assertBetAmount,
  creditForced,
  EconomyError,
  ensureUser,
  getJackpot,
  recordMatchResult,
} from "../services/wallet.js";
import { maybeAnnounceBigWin } from "../services/bigwin.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";
import { randomChoice } from "../utils/random.js";

const SYMBOLS = ["🏛️", "⚔️", "🐺", "🔥", "🪙", "💀", "🧿"] as const;
const PAY: Record<string, number> = {
  "🏛️": 20,
  "⚔️": 14,
  "🐺": 10,
  "🔥": 8,
  "🪙": 6,
  "💀": 4,
  "🧿": 3,
};

function spin(): [string, string, string] {
  return [randomChoice(SYMBOLS), randomChoice(SYMBOLS), randomChoice(SYMBOLS)];
}

function payout(reels: [string, string, string], bet: number): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return bet * (PAY[a] ?? 2);
  // Any two matching symbols (including non-adjacent)
  if (a === b || b === c || a === c) return bet * 2;
  return 0;
}

export const data = new SlashCommandBuilder()
  .setName("slots")
  .setDescription("Spin the Inferno slots for HellCatCoins")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager").setRequired(true).setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  let sessionId: string | null = null;
  let outcomeSettled = false;

  try {
    assertBetAmount(amount);
    await ackCommand(interaction);

    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.night)
          .setTitle(`${theme.emojis.spin} Inferno Slots`)
          .setDescription("🎰 | ❓ | ❓ | ❓ |"),
      ],
    });

    await ensureUser(interaction.user.id, interaction.user.username);
    const session = await openHouseSpin({
      type: "slots",
      userId: interaction.user.id,
      amount,
      channelId: interaction.channelId,
      debitReason: "slots_bet",
    });
    sessionId = session.id;

    const reels = spin();
    await animateInteraction(
      interaction,
      [
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("Inferno Slots")
              .setDescription(`🎰 | ${reels[0]} | ❓ | ❓ |`),
          ],
        },
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("Inferno Slots")
              .setDescription(`🎰 | ${reels[0]} | ${reels[1]} | ❓ |`),
          ],
        },
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("Inferno Slots")
              .setDescription(`🎰 | ${reels[0]} | ${reels[1]} | ${reels[2]} |`),
          ],
        },
      ],
      400,
    );

    const claimed = await settleHouseSpin(session.id);
    if (!claimed) {
      outcomeSettled = true;
      await interaction.editReply({
        embeds: [
          errorEmbed("Spin interrupted — your stake was refunded."),
        ],
      });
      return;
    }

    const win = payout(reels, amount);
    if (win > 0) {
      const { net, rake } = applyRake(win);
      try {
        await creditForced(interaction.user.id, net, "slots_win", session.id);
      } catch (err) {
        await revertHouseSpinSettle(session.id);
        throw err;
      }
      await addToJackpot(rake);
      outcomeSettled = true;
      await recordMatchResult({
        winnerId: interaction.user.id,
        loserId: null,
        amountWon: Math.max(0, net - amount),
      });
      await maybeAnnounceBigWin(interaction, net - amount, "slots").catch(() => undefined);
      await interaction.editReply({
        embeds: [
          baseEmbed(theme.colors.success)
            .setTitle(`${theme.emojis.fire} Jackpot line!`)
            .setDescription(
              `🎰 | ${reels.join(" | ")} |\nYou win **${formatCoins(net)}** (rake ${formatCoins(rake)}).`,
            ),
        ],
      });
    } else {
      await addToJackpot(Math.floor(amount * 0.03));
      outcomeSettled = true;
      const pot = await getJackpot();
      await recordMatchResult({
        winnerId: null,
        loserId: interaction.user.id,
        amountWon: 0,
      });
      await interaction.editReply({
        embeds: [
          baseEmbed(theme.colors.danger)
            .setTitle("House keeps the ash")
            .setDescription(
              `🎰 | ${reels.join(" | ")} |\nYou lose **${formatCoins(amount)}**.\nJackpot: **${formatCoins(pot)}**`,
            ),
        ],
      });
    }
  } catch (err) {
    console.error("[slots]", err);
    if (sessionId && !outcomeSettled) {
      await abortHouseSpin(
        sessionId,
        interaction.user.id,
        amount,
        "slots_refund_error",
      ).catch((e) => console.warn("[slots] refund failed", e));
    }
    const text =
      err instanceof EconomyError
        ? err.message
        : err instanceof Error
          ? `Slots failed: ${err.message}`
          : "Slots failed.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed(text)] }).catch(async () => {
        await interaction
          .followUp({ embeds: [errorEmbed(text)], flags: MessageFlags.Ephemeral })
          .catch(() => undefined);
      });
    } else {
      await interaction
        .reply({ embeds: [errorEmbed(text)], flags: MessageFlags.Ephemeral })
        .catch(() => undefined);
    }
  }
}
