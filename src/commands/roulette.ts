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
  recordMatchResult,
} from "../services/wallet.js";
import { maybeAnnounceBigWin } from "../services/bigwin.js";
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";
import { randomInt } from "../utils/random.js";

function colorOf(n: number): "red" | "black" | "green" {
  if (n === 0) return "green";
  const reds = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
  return reds.has(n) ? "red" : "black";
}

export const data = new SlashCommandBuilder()
  .setName("roulette")
  .setDescription("Spin Inferno roulette")
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Wager").setRequired(true).setMinValue(1),
  )
  .addStringOption((o) =>
    o
      .setName("bet")
      .setDescription("What you back")
      .setRequired(true)
      .addChoices(
        { name: "Red (2x)", value: "red" },
        { name: "Black (2x)", value: "black" },
        { name: "Green 0 (36x)", value: "green" },
      ),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const amount = interaction.options.getInteger("amount", true);
  const bet = interaction.options.getString("bet", true) as "red" | "black" | "green";
  let sessionId: string | null = null;
  let outcomeSettled = false;

  try {
    assertBetAmount(amount);
    await ackCommand(interaction);
    await interaction.editReply({
      embeds: [
        baseEmbed(theme.colors.night)
          .setTitle("🎡 Roulette")
          .setDescription("The wheel blurs into fire…"),
      ],
    });

    await ensureUser(interaction.user.id, interaction.user.username);
    const session = await openHouseSpin({
      type: "roulette",
      userId: interaction.user.id,
      amount,
      channelId: interaction.channelId,
      debitReason: "roulette_bet",
    });
    sessionId = session.id;

    const result = randomInt(37);
    const color = colorOf(result);

    await animateInteraction(
      interaction,
      [
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("🎡 Roulette")
              .setDescription("Spinning… 🔴⚫"),
          ],
        },
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("🎡 Roulette")
              .setDescription("Ball bouncing…"),
          ],
        },
      ],
      450,
    );

    const claimed = await settleHouseSpin(session.id);
    if (!claimed) {
      outcomeSettled = true;
      await interaction.editReply({
        embeds: [errorEmbed("Spin interrupted — your stake was refunded.")],
      });
      return;
    }

    const won = bet === color;
    const mult = bet === "green" ? 36 : 2;
    if (won) {
      const gross = amount * mult;
      const { net, rake } = applyRake(gross);
      try {
        await creditForced(interaction.user.id, net, "roulette_win", session.id);
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
      await maybeAnnounceBigWin(interaction, net - amount, "roulette").catch(() => undefined);
      await interaction.editReply({
        embeds: [
          baseEmbed(theme.colors.success)
            .setTitle(`Landed ${result} (${color})`)
            .setDescription(`You backed **${bet}** and win **${formatCoins(net)}**.`),
        ],
      });
    } else {
      await addToJackpot(Math.floor(amount * 0.02));
      outcomeSettled = true;
      await recordMatchResult({
        winnerId: null,
        loserId: interaction.user.id,
        amountWon: 0,
      });
      await interaction.editReply({
        embeds: [
          baseEmbed(theme.colors.danger)
            .setTitle(`Landed ${result} (${color})`)
            .setDescription(`You backed **${bet}**. Lost **${formatCoins(amount)}**.`),
        ],
      });
    }
  } catch (err) {
    console.error("[roulette]", err);
    if (sessionId && !outcomeSettled) {
      await abortHouseSpin(
        sessionId,
        interaction.user.id,
        amount,
        "roulette_refund_error",
      ).catch((e) => console.warn("[roulette] refund failed", e));
    }
    const text =
      err instanceof EconomyError
        ? err.message
        : err instanceof Error
          ? `Roulette failed: ${err.message}`
          : "Roulette failed.";
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
