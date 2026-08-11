import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  TextChannel,
} from "discord.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import {
  creditForced,
  debit,
  EconomyError,
  ensureUser,
  recordMatchResult,
} from "../services/wallet.js";
import { formatCoins, sleep, theme } from "../theme.js";
import { baseEmbed, errorEmbed, successEmbed } from "../utils/embeds.js";
import {
  loadGame,
  nextPhase,
  persistTributeStates,
  runPhase,
  tributesToState,
} from "./engine.js";
import type { ArenaPhase } from "./events.js";

const runningGames = new Set<string>();

function phaseTitle(phase: ArenaPhase, day: number): string {
  switch (phase) {
    case "bloodbath":
      return `${theme.emojis.swords} Bloodbath — Cornucopia`;
    case "day":
      return `${theme.emojis.fire} Day ${day}`;
    case "night":
      return `🌙 Night ${day}`;
    case "feast":
      return `🍖 The Feast — Day ${day}`;
    case "finale":
      return `${theme.emojis.trophy} Finale`;
  }
}

function kindEmoji(kind: string): string {
  switch (kind) {
    case "kill":
      return "⚔️";
    case "trap":
      return "🕳️";
    case "infect":
    case "spread":
      return "🐺";
    case "cure":
      return "💊";
    case "environment":
    case "suicide":
      return "💀";
    default:
      return "📜";
  }
}

function signupEmbed(
  gameId: string,
  hostTag: string,
  entryFee: number,
  prizePool: number,
  count: number,
  max: number,
) {
  return baseEmbed(theme.colors.inferno)
    .setTitle(`${theme.emojis.fire} Inferno Games — Volunteer as Tribute`)
    .setDescription(
      `**${hostTag}** opened the arena.\n\n` +
        `Survive Bloodbath → Day/Night cycles → traps, wolf infection, and betrayal.\n` +
        `Only one tribute walks out.\n\n` +
        `Entry: **${entryFee > 0 ? formatCoins(entryFee) : "FREE"}**\n` +
        `Prize pool: **${formatCoins(prizePool)}**\n` +
        `Tributes: **${count}/${max}** (min ${config.hgMinPlayers})`,
    )
    .setFooter({ text: `${theme.footer} · Game ${gameId.slice(0, 8)}` });
}

function signupRow(gameId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hg:join:${gameId}`)
      .setLabel("Join")
      .setEmoji("🩸")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`hg:leave:${gameId}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`hg:list:${gameId}`)
      .setLabel("Tributes")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`hg:start:${gameId}`)
      .setLabel("Start Games")
      .setEmoji("⚔️")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`hg:cancel:${gameId}`)
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );
}

function replaceHgRow(gameId: string, entryFee: number, maxPlayers: number) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`hg:replace:${gameId}:${entryFee}:${maxPlayers}`)
      .setLabel("Close previous & open new")
      .setStyle(ButtonStyle.Danger),
  );
}

async function replyOrEdit(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  payload: {
    content?: string;
    embeds: EmbedBuilder[];
    components?: ActionRowBuilder<ButtonBuilder>[];
  },
) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

function summaryEmbed(
  title: string,
  died: { displayName: string; text: string }[],
  alive: { displayName: string; userId: string; infected: boolean; kills: number }[],
  deadCount: number,
  banter?: string,
): EmbedBuilder {
  const deathLines =
    died.length === 0
      ? "_No deaths this period — the Inferno is patient._"
      : died.map((d) => `💀 **${d.displayName}**`).join("\n");

  const aliveLines = alive
    .slice(0, 20)
    .map((a) => {
      const mark = a.infected ? "🐺" : "❤️";
      return `${mark} **${a.displayName}** (${a.kills} kills)`;
    })
    .join("\n");

  const embed = baseEmbed(theme.colors.night)
    .setTitle(title)
    .addFields(
      { name: `Fallen this period (${died.length})`, value: deathLines.slice(0, 1000) || "—" },
      {
        name: `Still breathing (${alive.length}) · Dead total (${deadCount})`,
        value: (aliveLines || "_None_").slice(0, 1000),
      },
    );

  if (banter) embed.setDescription(`*${banter}*`);
  return embed;
}

function memberHasRole(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  roleId: string,
): boolean {
  const member = interaction.member;
  if (!member || !("roles" in member)) return false;
  const roles = member.roles as { cache?: { has: (id: string) => boolean } } | string[];
  if (Array.isArray(roles)) return roles.includes(roleId);
  if (roles && typeof roles === "object" && "cache" in roles && roles.cache) {
    return roles.cache.has(roleId);
  }
  return false;
}

async function canManage(
  interaction: ButtonInteraction | ChatInputCommandInteraction,
  hostId: string,
): Promise<boolean> {
  if (interaction.user.id === hostId) return true;
  if (
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
  ) {
    return true;
  }
  if (!interaction.guildId) return false;
  const settings = await prisma.guildSettings.findUnique({
    where: { guildId: interaction.guildId },
  });
  if (settings?.arenaMasterRole) {
    return memberHasRole(interaction, settings.arenaMasterRole);
  }
  return false;
}

function assertFee(fee: number) {
  if (fee > 0 && fee < config.minBet) {
    throw new EconomyError(`Entry fee must be 0 or at least ${config.minBet} HCC.`);
  }
  if (fee > config.maxBet) {
    throw new EconomyError(`Entry fee max is ${config.maxBet} HCC.`);
  }
}

export async function createInfernoGames(
  interaction: ChatInputCommandInteraction,
  entryFee: number,
  maxPlayers: number,
) {
  if (!interaction.guildId || !interaction.channel) {
    throw new EconomyError("Inferno Games can only run inside a server channel.");
  }

  const max = Math.min(Math.max(maxPlayers, config.hgMinPlayers), config.hgMaxPlayers);
  if (entryFee < 0) throw new EconomyError("Entry fee cannot be negative.");
  assertFee(entryFee);

  const existing = await prisma.arenaGame.findFirst({
    where: { guildId: interaction.guildId, status: { in: ["signup", "running"] } },
  });
  if (existing) {
    const canClose = await canManage(interaction, existing.hostId);
    await replyOrEdit(interaction, {
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle(`${theme.emojis.fire} Inferno Games already open`)
          .setDescription(
            `A round is already **${existing.status}** (host <@${existing.hostId}>).\n` +
              (canClose
                ? `Close it to open a new signup (entry **${entryFee > 0 ? formatCoins(entryFee) : "FREE"}**, max **${max}**).`
                : "Ask the host or a moderator to cancel it first."),
          ),
      ],
      components: canClose ? [replaceHgRow(existing.id, entryFee, max)] : [],
    });
    return;
  }

  await openInfernoSignup(interaction, entryFee, max);
}

async function openInfernoSignup(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  entryFee: number,
  maxPlayers: number,
) {
  if (!interaction.guildId || !interaction.channel) {
    throw new EconomyError("Inferno Games can only run inside a server channel.");
  }

  const game = await prisma.arenaGame.create({
    data: {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      hostId: interaction.user.id,
      status: "signup",
      phase: "signup",
      entryFee,
      prizePool: 0,
      maxPlayers,
    },
  });

  // If a race created another, cancel the newer duplicate
  const siblings = await prisma.arenaGame.findMany({
    where: { guildId: interaction.guildId, status: "signup" },
    orderBy: { createdAt: "asc" },
  });
  if (siblings.length > 1 && siblings[0]!.id !== game.id) {
    await prisma.arenaGame.update({
      where: { id: game.id },
      data: { status: "cancelled" },
    });
    throw new EconomyError("An Inferno Games round is already open in this server.");
  }

  const msg = await replyOrEdit(interaction, {
    embeds: [signupEmbed(game.id, interaction.user.toString(), entryFee, 0, 0, maxPlayers)],
    components: [signupRow(game.id)],
  });
  await prisma.arenaGame.update({
    where: { id: game.id },
    data: { messageId: msg.id },
  });
}

async function refundAllTributes(gameId: string, reason: string) {
  const game = await loadGame(gameId);
  if (!game) return;
  for (const t of game.tributes) {
    if (game.entryFee > 0) {
      await creditForced(t.userId, game.entryFee, reason, gameId).catch((err) =>
        console.warn("[hg] refund failed", t.userId, err),
      );
    }
  }
  await prisma.arenaGame.update({
    where: { id: gameId },
    data: { prizePool: 0 },
  });
}

export async function abortArenaGame(gameId: string, reason: string) {
  const claimed = await prisma.arenaGame.updateMany({
    where: { id: gameId, status: { in: ["signup", "running"] } },
    data: { status: "cancelled" },
  });
  if (claimed.count !== 1) return;
  await refundAllTributes(gameId, reason);
  runningGames.delete(gameId);
}

/** On boot: refund any arena left in running/signup from a prior crash. */
export async function recoverStuckArenas(): Promise<number> {
  const stuck = await prisma.arenaGame.findMany({
    where: { status: { in: ["running", "signup"] } },
  });
  for (const g of stuck) {
    // Only auto-recover long-running / orphaned — signup older than 2h or any running
    const age = Date.now() - g.updatedAt.getTime();
    if (g.status === "signup" && age < 2 * 60 * 60 * 1000) continue;
    await abortArenaGame(g.id, "hg_recovery_refund");
  }
  return stuck.length;
}

export async function handleHungerButton(interaction: ButtonInteraction) {
  const parts = interaction.customId.split(":");
  const action = parts[1];
  const gameId = parts[2];
  if (!action || !gameId) return;

  if (action === "replace") {
    const entryFee = Number(parts[3] ?? 0);
    const maxPlayers = Number(parts[4] ?? config.hgMaxPlayers);
    try {
      const existing = await loadGame(gameId);
      if (!existing || !["signup", "running"].includes(existing.status)) {
        await interaction.update({
          embeds: [
            baseEmbed(theme.colors.muted)
              .setTitle("Previous round already closed")
              .setDescription("Opening a fresh Inferno Games…"),
          ],
          components: [],
        });
      } else {
        if (!(await canManage(interaction, existing.hostId))) {
          await interaction.reply({
            embeds: [errorEmbed("Only the host or a moderator can close this round.")],
            flags: MessageFlags.Ephemeral,
          });
          return;
        }
        await abortArenaGame(gameId, "hg_replace_refund");
        // Soft-update the old public signup message if we can
        if (existing.messageId && existing.channelId) {
          const ch = await interaction.client.channels.fetch(existing.channelId).catch(() => null);
          if (ch && ch.isTextBased() && "messages" in ch) {
            const old = await ch.messages.fetch(existing.messageId).catch(() => null);
            await old
              ?.edit({
                embeds: [
                  baseEmbed(theme.colors.muted)
                    .setTitle("Inferno Games closed")
                    .setDescription("Closed to open a new round. Entry fees refunded."),
                ],
                components: [],
              })
              .catch(() => undefined);
          }
        }
        await interaction.update({
          embeds: [
            baseEmbed(theme.colors.night)
              .setTitle("Opening new Inferno Games…")
              .setDescription("Previous round closed. Posting fresh signup…"),
          ],
          components: [],
        });
      }

      assertFee(entryFee);
      const max = Math.min(Math.max(maxPlayers, config.hgMinPlayers), config.hgMaxPlayers);
      await openInfernoSignup(interaction, entryFee, max);
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Could not replace arena.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  if (action === "join") {
    await ensureUser(interaction.user.id, interaction.user.username);

    try {
      const preview = await prisma.arenaGame.findUnique({
        where: { id: gameId },
        include: { tributes: true },
      });
      if (!preview || preview.status !== "signup") {
        throw new EconomyError("Signup is closed.");
      }
      if (preview.tributes.length >= preview.maxPlayers) {
        throw new EconomyError("The arena is full.");
      }
      if (preview.tributes.some((t) => t.userId === interaction.user.id)) {
        throw new EconomyError("You already volunteered.");
      }

      if (preview.entryFee > 0) {
        await debit(interaction.user.id, preview.entryFee, "hg_entry", gameId);
      }

      let prizePool = preview.prizePool;
      try {
        prizePool = await prisma.$transaction(async (tx) => {
          const game = await tx.arenaGame.findUnique({
            where: { id: gameId },
            include: { tributes: true },
          });
          if (!game || game.status !== "signup") {
            throw new EconomyError("Signup closed while you were joining.");
          }
          if (game.tributes.length >= game.maxPlayers) {
            throw new EconomyError("The arena is full.");
          }
          if (game.tributes.some((t) => t.userId === interaction.user.id)) {
            throw new EconomyError("You already volunteered.");
          }
          await tx.arenaTribute.create({
            data: {
              gameId,
              userId: interaction.user.id,
              displayName: interaction.user.username,
            },
          });
          const updated = await tx.arenaGame.update({
            where: { id: gameId },
            data: { prizePool: { increment: game.entryFee } },
          });
          return updated.prizePool;
        });
      } catch (err) {
        if (preview.entryFee > 0) {
          await creditForced(interaction.user.id, preview.entryFee, "hg_join_rollback", gameId);
        }
        if (err instanceof EconomyError) throw err;
        throw new EconomyError("Could not join (already in or race). Try again.");
      }

      const still = await prisma.arenaGame.findUnique({ where: { id: gameId } });
      const refreshed = await loadGame(gameId);
      await interaction.update({
        embeds: [
          signupEmbed(
            gameId,
            `<@${still!.hostId}>`,
            still!.entryFee,
            prizePool,
            refreshed!.tributes.length,
            still!.maxPlayers,
          ),
        ],
        components: [signupRow(gameId)],
      });
      await interaction
        .followUp({
          embeds: [
            successEmbed(
              "Tribute accepted",
              `${interaction.user} enters the Inferno${preview.entryFee ? ` (−${formatCoins(preview.entryFee)})` : ""}.`,
            ),
          ],
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => undefined);
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Join failed.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      }
    }
    return;
  }

  const game = await loadGame(gameId);
  if (!game) {
    await interaction.reply({
      embeds: [errorEmbed("This Inferno Games round no longer exists.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "leave") {
    if (game.status !== "signup") {
      await interaction.reply({
        embeds: [errorEmbed("Too late to leave — the horns already sounded.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const tribute = game.tributes.find((t) => t.userId === interaction.user.id);
    if (!tribute) {
      await interaction.reply({
        embeds: [errorEmbed("You are not in this round.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    let prizePool = game.prizePool;
    try {
      prizePool = await prisma.$transaction(async (tx) => {
        const deleted = await tx.arenaTribute.deleteMany({
          where: { id: tribute.id, gameId: game.id },
        });
        if (deleted.count !== 1) {
          throw new EconomyError("You are not in this round.");
        }
        if (game.entryFee > 0) {
          const updated = await tx.arenaGame.updateMany({
            where: { id: game.id, status: "signup", prizePool: { gte: game.entryFee } },
            data: { prizePool: { decrement: game.entryFee } },
          });
          if (updated.count !== 1) {
            throw new EconomyError("Could not leave (signup closed).");
          }
        }
        const fresh = await tx.arenaGame.findUniqueOrThrow({ where: { id: game.id } });
        return fresh.prizePool;
      });
    } catch (err) {
      const msg = err instanceof EconomyError ? err.message : "Leave failed.";
      await interaction.reply({ embeds: [errorEmbed(msg)], flags: MessageFlags.Ephemeral });
      return;
    }

    if (game.entryFee > 0) {
      await creditForced(interaction.user.id, game.entryFee, "hg_leave_refund", game.id);
    }
    const refreshed = await loadGame(game.id);
    await interaction.update({
      embeds: [
        signupEmbed(
          game.id,
          `<@${game.hostId}>`,
          game.entryFee,
          prizePool,
          refreshed!.tributes.length,
          game.maxPlayers,
        ),
      ],
      components: [signupRow(game.id)],
    });
    return;
  }

  if (action === "list") {
    const lines = game.tributes.length
      ? game.tributes.map((t, i) => `\`${i + 1}.\` **${t.displayName}**`).join("\n")
      : "_No tributes yet._";
    await interaction.reply({
      embeds: [
        baseEmbed(theme.colors.gold).setTitle("Tributes").setDescription(lines.slice(0, 4000)),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === "cancel") {
    if (!(await canManage(interaction, game.hostId))) {
      await interaction.reply({
        embeds: [errorEmbed("Only the host or a moderator can cancel.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (game.status !== "signup") {
      await interaction.reply({
        embeds: [errorEmbed("Cannot cancel mid-bloodbath. Let fate finish.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const claimed = await prisma.arenaGame.updateMany({
      where: { id: game.id, status: "signup" },
      data: { status: "cancelled" },
    });
    if (claimed.count !== 1) {
      await interaction.reply({
        embeds: [errorEmbed("Already closed.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await refundAllTributes(game.id, "hg_cancel_refund");
    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.muted)
          .setTitle("Inferno Games cancelled")
          .setDescription("Entry fees refunded. The mutts go hungry tonight."),
      ],
      components: [],
    });
    return;
  }

  if (action === "start") {
    if (!(await canManage(interaction, game.hostId))) {
      await interaction.reply({
        embeds: [errorEmbed("Only the host or a moderator can start.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const live = await loadGame(game.id);
    if (!live || live.status !== "signup") {
      await interaction.reply({
        embeds: [errorEmbed("This round already started or closed.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (live.tributes.length < config.hgMinPlayers) {
      await interaction.reply({
        embeds: [
          errorEmbed(
            `Need at least **${config.hgMinPlayers}** tributes (have ${live.tributes.length}).`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Atomic claim: only one starter wins
    const claimed = await prisma.arenaGame.updateMany({
      where: { id: live.id, status: "signup" },
      data: { status: "running", phase: "bloodbath", dayNumber: 0 },
    });
    if (claimed.count !== 1) {
      await interaction.reply({
        embeds: [errorEmbed("This round already started or closed.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Re-verify count after claim; abort if under min (late leaves)
    const started = await loadGame(live.id);
    if (!started || started.tributes.length < config.hgMinPlayers) {
      await abortArenaGame(live.id, "hg_start_undermin_refund");
      await interaction.reply({
        embeds: [
          errorEmbed(
            `Need at least **${config.hgMinPlayers}** tributes to start. Round cancelled and fees refunded.`,
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    runningGames.add(live.id);

    await interaction.update({
      embeds: [
        baseEmbed(theme.colors.inferno)
          .setTitle(`${theme.emojis.fire} Inferno Games — LIVE`)
          .setDescription(
            `**${started.tributes.length}** tributes enter the arena.\n` +
              `Prize pool: **${formatCoins(started.prizePool)}**\n\n` +
              `_The horns sound. Run._`,
          ),
      ],
      components: [],
    });

    void runArenaSimulation(interaction, live.id);
    return;
  }

  await interaction.reply({
    embeds: [errorEmbed("Unknown arena action.")],
    flags: MessageFlags.Ephemeral,
  }).catch(() => undefined);
}

async function runArenaSimulation(interaction: ButtonInteraction, gameId: string) {
  try {
    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await abortArenaGame(gameId, "hg_abort_no_channel");
      return;
    }
    const textChannel = channel as TextChannel;

    let phase: ArenaPhase = "bloodbath";
    let dayNumber = 0;
    let guard = 0;

    while (guard++ < 80) {
      const game = await loadGame(gameId);
      if (!game || game.status !== "running") break;

      const states = tributesToState(game.tributes);
      const alive = states.filter((t) => t.alive);
      if (alive.length <= 1) {
        await crownWinner(textChannel, gameId, states, game.prizePool);
        break;
      }

      if (alive.length === 2) phase = "finale";

      await textChannel.send({
        embeds: [
          baseEmbed(theme.colors.inferno)
            .setTitle(phaseTitle(phase, dayNumber))
            .setDescription(
              phase === "bloodbath"
                ? "Sixty seconds of chaos. Grab steel or grab dirt."
                : phase === "night"
                  ? "The mutts wake. Infection festers. Knives prefer the dark."
                  : phase === "feast"
                    ? "A table of gifts appears in the ash. So do the knives."
                    : phase === "finale"
                      ? "Two tributes. One crown. No sponsors left to save you."
                      : "The sun bleeds over the arena. Someone will not see dusk.",
            ),
        ],
      });

      const result = runPhase(states, phase, dayNumber);
      const deathTexts = new Map<string, string>();
      for (const d of result.diedThisPhase) deathTexts.set(d.userId, d.text);

      for (const ev of result.events) {
        await sleep(config.hgEventDelayMs);
        await textChannel.send({
          embeds: [
            baseEmbed(
              ev.deaths.length
                ? theme.colors.danger
                : ev.kind === "infect" || ev.kind === "spread"
                  ? 0x7c3aed
                  : theme.colors.night,
            )
              .setTitle(`${kindEmoji(ev.kind)} Arena Event`)
              .setDescription(ev.text),
          ],
        });
      }

      await persistTributeStates(gameId, states, phase, dayNumber, deathTexts);

      await sleep(1500);
      await textChannel.send({
        embeds: [
          summaryEmbed(
            `📋 ${phaseTitle(phase, dayNumber)} — Casualty Report`,
            result.diedThisPhase,
            result.aliveAfter.map((a) => ({
              displayName: a.displayName,
              userId: a.userId,
              infected: a.infected,
              kills: a.kills,
            })),
            result.deadAfter.length,
            result.banter,
          ),
        ],
      });

      if (result.aliveAfter.length <= 1) {
        await crownWinner(textChannel, gameId, states, game.prizePool);
        break;
      }

      const nxt = nextPhase(phase, dayNumber, result.aliveAfter.length);
      phase = nxt.phase;
      dayNumber = nxt.dayNumber;
      await prisma.arenaGame.update({
        where: { id: gameId },
        data: { phase, dayNumber },
      });

      await sleep(2000);
    }

    // If loop exited without crowning, force finish
    const finalGame = await loadGame(gameId);
    if (finalGame?.status === "running") {
      const states = tributesToState(finalGame.tributes);
      // Sudden death: keep killing until one left
      while (states.filter((t) => t.alive).length > 1) {
        runPhase(states, "finale", finalGame.dayNumber);
      }
      await persistTributeStates(gameId, states, "finale", finalGame.dayNumber, new Map());
      await crownWinner(textChannel, gameId, states, finalGame.prizePool);
    }
  } catch (err) {
    console.error("[inferno-games]", err);
    await abortArenaGame(gameId, "hg_abort_error_refund").catch(() => undefined);
  } finally {
    runningGames.delete(gameId);
  }
}

async function crownWinner(
  channel: TextChannel,
  gameId: string,
  states: ReturnType<typeof tributesToState>,
  prizePool: number,
) {
  const alive = states.filter((t) => t.alive);
  const winner = alive[0];
  const killBoard = [...states]
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 5)
    .map((t, i) => `\`${i + 1}.\` **${t.displayName}** — ${t.kills} kills`)
    .join("\n");

  const claimed = await prisma.arenaGame.updateMany({
    where: { id: gameId, status: "running" },
    data: {
      status: "finished",
      phase: "finale",
      winnerId: winner?.userId ?? null,
      prizePool: 0,
    },
  });
  if (claimed.count !== 1) return; // already finished / paid

  let payoutLine = "";
  try {
    if (winner && prizePool > 0) {
      await ensureUser(winner.userId, winner.displayName);
      await creditForced(winner.userId, prizePool, "hg_prize", gameId);
      payoutLine = `Prize: **${formatCoins(prizePool)}** HellCatCoins deposited.\n\n`;
    } else if (!winner && prizePool > 0) {
      const game = await loadGame(gameId);
      if (game && game.entryFee > 0) {
        for (const t of game.tributes) {
          await creditForced(t.userId, game.entryFee, "hg_no_victor_refund", gameId).catch(
            () => undefined,
          );
        }
        payoutLine = `No victor — entry fees refunded.\n\n`;
      }
    }

    // Track Inferno Games on player profiles
    if (winner) {
      await recordMatchResult({
        winnerId: winner.userId,
        loserId: null,
        amountWon: Math.max(0, prizePool),
      });
      for (const t of states) {
        if (t.userId === winner.userId) continue;
        await recordMatchResult({
          winnerId: null,
          loserId: t.userId,
          amountWon: 0,
        }).catch(() => undefined);
      }
    }
  } catch (err) {
    console.warn("[hg] prize payout failed, restoring running+pool", gameId, err);
    await prisma.arenaGame.updateMany({
      where: { id: gameId, status: "finished" },
      data: {
        status: "running",
        prizePool,
        winnerId: null,
      },
    });
    throw err;
  }

  await channel.send({
    embeds: [
      baseEmbed(theme.colors.gold)
        .setTitle(`${theme.emojis.trophy} Victor of the Inferno Games`)
        .setDescription(
          winner
            ? `**${winner.displayName}** (<@${winner.userId}>) is the last tribute standing!\n` +
              payoutLine +
              `*May the odds burn forever in your favor.*`
            : `_No victors. The arena ate everyone._\n${payoutLine}`,
        )
        .addFields({ name: "Kill leaders", value: killBoard || "—" })
        .addFields({
          name: "Final count",
          value: `Alive: **${alive.length}** · Dead: **${states.length - alive.length}** · Infected survivors: **${alive.filter((a) => a.infected).length}**`,
        }),
    ],
  });
}

export async function statusInfernoGames(interaction: ChatInputCommandInteraction) {
  if (!interaction.guildId) {
    await replyOrEdit(interaction, { embeds: [errorEmbed("Server only.")] });
    return;
  }
  const game = await prisma.arenaGame.findFirst({
    where: { guildId: interaction.guildId, status: { in: ["signup", "running"] } },
    include: { tributes: true },
    orderBy: { createdAt: "desc" },
  });
  if (!game) {
    await replyOrEdit(interaction, {
      embeds: [errorEmbed("No active Inferno Games. Use `/hungergames new`.")],
    });
    return;
  }

  const alive = game.tributes.filter((t) => t.alive);
  const dead = game.tributes.filter((t) => !t.alive);
  await replyOrEdit(interaction, {
    embeds: [
      baseEmbed(theme.colors.inferno)
        .setTitle("Inferno Games — Status")
        .addFields(
          {
            name: "Status",
            value: `${game.status} · ${game.phase} · day ${game.dayNumber}`,
            inline: true,
          },
          { name: "Prize", value: formatCoins(game.prizePool), inline: true },
          {
            name: `Alive (${alive.length})`,
            value:
              alive
                .map((t) => `${t.infected ? "🐺" : "❤️"} **${t.displayName}**`)
                .join("\n")
                .slice(0, 1000) || "—",
          },
          {
            name: `Dead (${dead.length})`,
            value: dead.map((t) => `💀 **${t.displayName}**`).join("\n").slice(0, 1000) || "—",
          },
        ),
    ],
  });
}
