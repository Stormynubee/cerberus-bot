import {
  ChatInputCommandInteraction,
  Message,
  MessageEditOptions,
  MessagePayload,
} from "discord.js";
import { sleep } from "../theme.js";

type Step = string | MessagePayload | MessageEditOptions;

/** Staged embed animation via message.edit (channel messages only). */
export async function animateSteps(
  message: Message,
  steps: Step[],
  delayMs = 550,
): Promise<Message> {
  let current = message;
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await sleep(delayMs);
    current = await current.edit(steps[i]!);
  }
  return current;
}

/**
 * Animate a slash-command reply safely.
 * Prefer interaction.editReply — Message#edit often fails on interaction webhook replies
 * (Missing Access / Unknown Message), which surfaced as generic "Slots failed."
 */
export async function animateInteraction(
  interaction: ChatInputCommandInteraction,
  steps: MessageEditOptions[],
  delayMs = 450,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await sleep(delayMs);
    await interaction.editReply(steps[i]!);
  }
}
