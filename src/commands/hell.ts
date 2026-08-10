import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { replyHelp } from "../services/helpGuide.js";

export const data = new SlashCommandBuilder()
  .setName("hell")
  .setDescription("GreekBot help (same as /help) — guide + demo GIFs");

export async function execute(interaction: ChatInputCommandInteraction) {
  await replyHelp(interaction, "home");
}
