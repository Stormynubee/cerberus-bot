import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import {
  Card,
  cardRankValue,
  draw,
  formatCard,
  freshDeck,
} from "../games/cards.js";
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
import { formatCoins, theme } from "../theme.js";
import { baseEmbed, errorEmbed } from "../utils/embeds.js";

type HiLoState = {
  userId: string;
  bet: number;
  streak: number;
  pot: number;
  current: Card;
  deck: Card[];
  ended: boolean;
};

const games = new Map<string, HiLoState>();

function claimHiLo(game: HiLoState): boolean {
  if (game.ended) return false;
  game.ended = true;
  return true;
}

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
    await ensureUser(interaction.user.id, interaction.user.username);
    if ([...games.values()].some((g) => g.userId === interaction.user.id && !g.ended)) {
      throw new EconomyError("Finish your current High-Low run first.");
    }
    await debit(interaction.user.id, amount, "highlow_bet");
    const deck = freshDeck();
    const current = draw(deck);
    const id = interaction.id;
    games.set(id, {
      userId: interaction.user.id,
      bet: amount,
      streak: 0,
      pot: amount,
      current,
      deck,
      ended: false,
    });

    await interaction.reply({
      embeds: [
        baseEmbed(theme.colors.inferno)
          .setTitle("🃏 High-Low")
          .setDescription(
              `Card: ${formatCard(current)} (rank ${cardRankValue(current)})\n` +
              `Pot: **${formatCoins(amount)}** · Streak: **0**\n` +
              `Will the next card be higher or lower?`,
          ),
      ],
      components: [row(id)],
    });
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "High-Low failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
    }
  }
}

export async function handleHighLowButton(interaction: ButtonInteraction) {
  const [, action, id] = interaction.customId.split(":");
  if (!id || !action) return;
  const game = games.get(id);
  if (!game || game.ended) {
    await interaction.reply({
      embeds: [errorEmbed("Run expired.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (interaction.user.id !== game.userId) {
    await interaction.reply({
      embeds: [errorEmbed("Not your climb.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "cash") {
    if (!claimHiLo(game)) {
      await interaction.reply({
        embeds: [errorEmbed("Run already finished.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const { net, rake } = applyRake(game.pot);
    await creditForced(game.userId, net, "highlow_cashout");
    await addToJackpot(rake);
    await recordMatchResult({
      winnerId: game.userId,
      loserId: null,
      amountWon: net - game.bet,
    });
    games.delete(id);
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.success)
          .setTitle("Cashed out")
          .setDescription(`You leave with **${formatCoins(net)}** after ${game.streak} climb(s).`),
      ],
      components: [],
    });
    await maybeAnnounceBigWin(interaction, net - game.bet, "highlow");
    return;
  }

  const next = draw(game.deck);
  const curVal = cardRankValue(game.current);
  const nextVal = cardRankValue(next);
  const correct =
    action === "high" ? nextVal > curVal : action === "low" ? nextVal < curVal : false;
  const tie = nextVal === curVal;

  if (tie) {
    game.current = next;
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle("Push — same value")
          .setDescription(
            `${formatCard(game.current)} → ${formatCard(next)}\nPot still **${formatCoins(game.pot)}**. Go again.`,
          ),
      ],
      components: [row(id)],
    });
    return;
  }

  if (!correct) {
    if (!claimHiLo(game)) return;
    await addToJackpot(Math.floor(game.bet * 0.02));
    await recordMatchResult({
      winnerId: null,
      loserId: game.userId,
      amountWon: 0,
    });
    games.delete(id);
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.danger)
          .setTitle("Climb broken")
          .setDescription(
            `${formatCard(game.current)} → ${formatCard(next)}\nYou lose the pot of **${formatCoins(game.pot)}**.`,
          ),
      ],
      components: [],
    });
    return;
  }

  game.streak += 1;
  game.pot = Math.floor(game.pot * 1.45);
  game.current = next;
  await interaction.update({
    embeds: [
      baseEmbed(theme.colors.success)
        .setTitle(`Climb ${game.streak}!`)
        .setDescription(
          `${formatCard(next)} — correct!\nPot: **${formatCoins(game.pot)}**\nHigher, lower, or cash out?`,
        ),
    ],
    components: [row(id)],
  });
}
