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
      .setDescription("Set the server default entry fee (and max players) for Inferno Games")
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
      const fee = interaction.options.getInteger("entry_fee");
      const max = interaction.options.getInteger("max_players");
      await setupInfernoGames(interaction, fee, max);
      return;
    }
    if (sub === "new") {
      const defaults = interaction.guildId
        ? await getHgDefaults(interaction.guildId)
        : { entryFee: 0, maxPlayers: config.hgMaxPlayers };
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
