import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { EconomyError } from "../services/wallet.js";
import { config } from "../config.js";
import { errorEmbed } from "../utils/embeds.js";
import { createInfernoGames, statusInfernoGames } from "../hungergames/runner.js";

export const data = new SlashCommandBuilder()
  .setName("hungergames")
  .setDescription("Inferno Games — Hunger Games battle royale for the server")
  .addSubcommand((sc) =>
    sc
      .setName("new")
      .setDescription("Open tribute signup for a new Inferno Games")
      .addIntegerOption((o) =>
        o
          .setName("entry_fee")
          .setDescription("HellCatCoins entry fee (0 = free)")
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
  try {
    if (sub === "new") {
      const fee = interaction.options.getInteger("entry_fee") ?? 0;
      const max = interaction.options.getInteger("max_players") ?? config.hgMaxPlayers;
      await createInfernoGames(interaction, fee, max);
      return;
    }
    if (sub === "status") {
      await statusInfernoGames(interaction);
    }
  } catch (err) {
    const msg = err instanceof EconomyError ? err.message : "Inferno Games failed.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed(msg)], ephemeral: true });
    } else {
      await interaction.reply({ embeds: [errorEmbed(msg)], ephemeral: true });
    }
  }
}
