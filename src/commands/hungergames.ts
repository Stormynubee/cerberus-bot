import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { EconomyError } from "../services/wallet.js";
import { config } from "../config.js";
import { errorEmbed } from "../utils/embeds.js";
import { ackCommand } from "../utils/interaction.js";
import {
  createInfernoGames,
  getHgDefaults,
  setupInfernoGames,
  statusInfernoGames,
} from "../hungergames/runner.js";

export const data = new SlashCommandBuilder()
  .setName("hungergames")
  .setDescription("Inferno Games — Hunger Games battle royale for the server")
  .addSubcommand((sc) =>
    sc
      .setName("setup")
      .setDescription("Set Inferno Games defaults (win prize, revives, entry fee)")
      .addIntegerOption((o) =>
        o
          .setName("win_prize")
          .setDescription("HCC paid to the last tribute standing (default 250)")
          .setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("revive_cost")
          .setDescription("HCC cost to revive when dead (default 50)")
          .setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("max_revives")
          .setDescription("Max revives per tribute per round (default 2)")
          .setMinValue(0)
          .setMaxValue(10),
      )
      .addIntegerOption((o) =>
        o
          .setName("entry_fee")
          .setDescription("Default HellCatCoins entry fee (0 = free)")
          .setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("max_players")
          .setDescription(`Default max tributes (${config.hgMinPlayers}–${config.hgMaxPlayers})`)
          .setMinValue(config.hgMinPlayers)
          .setMaxValue(config.hgMaxPlayers),
      ),
  )
  .addSubcommand((sc) =>
    sc
      .setName("new")
      .setDescription("Open tribute signup for a new Inferno Games")
      .addIntegerOption((o) =>
        o
          .setName("entry_fee")
          .setDescription("Override entry fee for this round (omit = server default)")
          .setMinValue(0),
      )
      .addIntegerOption((o) =>
        o
          .setName("max_players")
          .setDescription(`Max tributes (${config.hgMinPlayers}–${config.hgMaxPlayers})`)
          .setMinValue(config.hgMinPlayers)
          .setMaxValue(config.hgMaxPlayers),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName("status").setDescription("Show alive/dead for the active Inferno Games"),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const sub = interaction.options.getSubcommand();
  await ackCommand(interaction);
  try {
    if (sub === "setup") {
      await setupInfernoGames(interaction, {
        entryFee: interaction.options.getInteger("entry_fee"),
        maxPlayers: interaction.options.getInteger("max_players"),
        winPrize: interaction.options.getInteger("win_prize"),
        reviveCost: interaction.options.getInteger("revive_cost"),
        maxRevives: interaction.options.getInteger("max_revives"),
      });
      return;
    }
    if (sub === "new") {
      const defaults = interaction.guildId
        ? await getHgDefaults(interaction.guildId)
        : {
            entryFee: 0,
            maxPlayers: config.hgMaxPlayers,
            winPrize: config.hgDefaultWinPrize,
            reviveCost: config.hgDefaultReviveCost,
            maxRevives: config.hgDefaultMaxRevives,
          };
      const fee = interaction.options.getInteger("entry_fee") ?? defaults.entryFee;
      const max = interaction.options.getInteger("max_players") ?? defaults.maxPlayers;
      await createInfernoGames(interaction, fee, max);
      return;
    }
    if (sub === "status") {
      await statusInfernoGames(interaction);
    }
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Inferno Games failed.";
    await interaction.editReply({ embeds: [errorEmbed(msg)] });
  }
}
