import { Message, MessageEditOptions, MessagePayload } from "discord.js";
import { sleep } from "../theme.js";

/** Staged embed “animation” via message edits. */
export async function animateSteps(
  message: Message,
  steps: Array<string | MessagePayload | MessageEditOptions>,
  delayMs = 550,
): Promise<Message> {
  let current = message;
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) await sleep(delayMs);
    current = await current.edit(steps[i]!);
  }
  return current;
}
