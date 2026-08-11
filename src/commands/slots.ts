import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { animateSteps } from "../services/animation.js";
import {
  addToJackpot,
  applyRake,
  assertBetAmount,
  creditForced,
  debit,
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
  "🏛️": 12,
  "⚔️": 8,
  "🐺": 6,
  "🔥": 5,
  "🪙": 4,
  "💀": 3,
  "🧿": 2,
};

function spin(): [string, string, string] {
  const pick = () => randomChoice(SYMBOLS);
  return [pick(), pick(), pick()];
}

function payout(reels: [string, string, string], bet: number): number {
  const [a, b, c] = reels;
  if (a === b && b === c) return bet * (PAY[a] ?? 2);
  if (a === b || b === c || a === c) return Math.floor(bet * 1.5);
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
  let debited = false;
  let settled = false;
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
    await debit(interaction.user.id, amount, "slots_bet");
    debited = true;

    const reels = spin();
    const msg = await interaction.fetchReply();
    await animateSteps(
      msg,
      [
        { embeds: [baseEmbed(theme.colors.night).setTitle("Inferno Slots").setDescription(`🎰 | ${reels[0]} | ❓ | ❓ |`)] },
        { embeds: [baseEmbed(theme.colors.night).setTitle("Inferno Slots").setDescription(`🎰 | ${reels[0]} | ${reels[1]} | ❓ |`)] },
        {
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("Inferno Slots")
              .setDescription(`🎰 | ${reels[0]} | ${reels[1]} | ${reels[2]} |`),
          ],
        },
      ],
      450,
    );

    const win = payout(reels, amount);
    if (win > 0) {
      const { net, rake } = applyRake(win);
      await creditForced(interaction.user.id, net, "slots_win");
      await addToJackpot(rake);
      settled = true;
      await recordMatchResult({
        winnerId: interaction.user.id,
        loserId: null,
        amountWon: net - amount,
      });
      await maybeAnnounceBigWin(interaction, net - amount, "slots");
      await msg.edit({
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
      settled = true;
      const pot = await getJackpot();
      await recordMatchResult({
        winnerId: null,
        loserId: interaction.user.id,
        amountWon: 0,
      });
      await msg.edit({
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
    if (debited && !settled) {
      await creditForced(interaction.user.id, amount, "slots_refund_error").catch((e) =>
        console.warn("[slots] refund failed", e),
      );
    }
    const msg = err instanceof EconomyError ? err.message : "Slots failed.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [errorEmbed(msg)] }).catch(async () => {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
    }
  }
}
