import { ChatInputCommandInteraction } from "discord.js";

/** Acknowledge a slash command within Discord's 3-second window. */
export async function ackCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
}
