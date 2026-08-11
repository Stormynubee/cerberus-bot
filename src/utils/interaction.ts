import {
  ChatInputCommandInteraction,
  InteractionEditReplyOptions,
  InteractionReplyOptions,
  MessageFlags,
} from "discord.js";

/** Acknowledge a slash command within Discord's 3-second window. */
export async function ackCommand(
  interaction: ChatInputCommandInteraction,
  ephemeral = false,
): Promise<void> {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply(
      ephemeral ? { flags: MessageFlags.Ephemeral } : undefined,
    );
  }
}

/** Reply or edit depending on whether we already deferred. */
export async function respond(
  interaction: ChatInputCommandInteraction,
  payload: InteractionReplyOptions | InteractionEditReplyOptions,
): Promise<void> {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload as InteractionEditReplyOptions);
    return;
  }
  await interaction.reply(payload as InteractionReplyOptions);
}
