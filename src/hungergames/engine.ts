import type { ArenaGame, ArenaTribute } from "@prisma/client";
import { prisma } from "../db.js";
import {
  ARENA_EVENTS,
  ArenaEventDef,
  ArenaPhase,
  BANTER_LINES,
  fillTemplate,
  pickWeighted,
} from "./events.js";

export type TributeState = {
  id: string;
  userId: string;
  displayName: string;
  alive: boolean;
  infected: boolean;
  kills: number;
};

export type ResolvedEvent = {
  text: string;
  kind: ArenaEventDef["kind"];
  deaths: { userId: string; displayName: string; text: string }[];
  infected: string[];
  cured: string[];
  killerId?: string;
};

export type PhaseResult = {
  phase: ArenaPhase;
  dayNumber: number;
  events: ResolvedEvent[];
  banter?: string;
  diedThisPhase: { userId: string; displayName: string; text: string }[];
  aliveAfter: TributeState[];
  deadAfter: TributeState[];
};

function mention(t: { userId: string; displayName: string }): string {
  return `**${t.displayName}**`;
}

function living(tributes: TributeState[]): TributeState[] {
  return tributes.filter((t) => t.alive);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function eligibleEvents(
  phase: ArenaPhase,
  aliveCount: number,
  hasInfected: boolean,
): ArenaEventDef[] {
  return ARENA_EVENTS.filter((e) => {
    if (!e.phases.includes(phase)) return false;
    if (e.actors > aliveCount) return false;
    if (e.kind === "cure" && !hasInfected) return false;
    if (e.kind === "spread" && !hasInfected) return false;
    // Spread needs at least one clean target
    if (e.kind === "spread") {
      /* checked later with clean count */
    }
    if (e.id === "night-infection-death" && !hasInfected) return false;
    return true;
  });
}

export function applyEvent(
  tributes: TributeState[],
  phase: ArenaPhase,
  depth = 0,
): ResolvedEvent | null {
  if (depth > 8) return null;

  const alive = living(tributes);
  if (alive.length <= 1) return null;

  const infectedAlive = alive.filter((t) => t.infected);
  const cleanAlive = alive.filter((t) => !t.infected);
  const hasInfected = infectedAlive.length > 0;

  let pool = eligibleEvents(phase, alive.length, hasInfected).filter((e) => {
    if (e.kind === "spread" && cleanAlive.length === 0) return false;
    if (e.kind === "cure" && infectedAlive.length === 0) return false;
    if (e.id === "night-infection-death" && infectedAlive.length === 0) return false;
    if (e.id === "finale-infection" && infectedAlive.length === 0) return false;
    return true;
  });
  if (!pool.length) return null;

  // Prefer infection-death at night for infected tributes
  if (phase === "night" && hasInfected && Math.random() < 0.45) {
    const deathPool = pool.filter((e) => e.id === "night-infection-death");
    if (deathPool.length) pool = deathPool;
  }

  // Prefer spread if infected + someone clean
  if (phase === "night" && hasInfected && cleanAlive.length > 0 && Math.random() < 0.35) {
    const spread = pool.filter((e) => e.kind === "spread");
    if (spread.length) pool = spread;
  }

  const def = pickWeighted(pool);
  let actors = shuffle(alive).slice(0, def.actors);

  if (def.kind === "spread") {
    if (!infectedAlive.length || !cleanAlive.length) return applyEvent(tributes, phase, depth + 1);
    actors = [shuffle(infectedAlive)[0]!, shuffle(cleanAlive)[0]!];
  }
  if (def.kind === "cure") {
    if (!infectedAlive.length) return null;
    actors = [shuffle(infectedAlive)[0]!];
  }
  if (def.id === "night-infection-death") {
    if (!infectedAlive.length) return null;
    actors = [shuffle(infectedAlive)[0]!];
  }
  if (def.id === "finale-infection") {
    // Killer can be anyone; victim must be infected if possible
    if (infectedAlive.length && alive.length >= 2) {
      const victim = shuffle(infectedAlive)[0]!;
      const killer = shuffle(alive.filter((t) => t.userId !== victim.userId))[0]!;
      actors = [killer, victim];
    } else {
      return applyEvent(tributes, phase, depth + 1);
    }
  }

  const names = actors.map(mention);
  const text = fillTemplate(def.text, names);
  const deaths: ResolvedEvent["deaths"] = [];
  const infected: string[] = [];
  const cured: string[] = [];

  for (const idx of def.deaths ?? []) {
    const victim = actors[idx];
    if (!victim || !victim.alive) continue;
    victim.alive = false;
    deaths.push({ userId: victim.userId, displayName: victim.displayName, text });
  }

  if (def.killer !== undefined) {
    const killer = actors[def.killer];
    if (killer) killer.kills += deaths.length;
  }

  for (const idx of def.infect ?? []) {
    const t = actors[idx];
    if (t && t.alive) {
      t.infected = true;
      infected.push(t.userId);
    }
  }

  for (const idx of def.cure ?? []) {
    const t = actors[idx];
    if (t && t.alive) {
      t.infected = false;
      cured.push(t.userId);
    }
  }

  return {
    text,
    kind: def.kind,
    deaths,
    infected,
    cured,
    killerId: def.killer !== undefined ? actors[def.killer]?.userId : undefined,
  };
}

/** How many events to run in a phase before summarizing */
export function eventsPerPhase(phase: ArenaPhase, aliveCount: number): number {
  if (phase === "bloodbath") return Math.min(aliveCount, Math.max(3, Math.ceil(aliveCount * 0.45)));
  if (phase === "feast") return Math.min(aliveCount, Math.max(2, Math.ceil(aliveCount * 0.4)));
  if (phase === "finale") return 3;
  return Math.min(aliveCount, Math.max(2, Math.ceil(aliveCount * 0.35)));
}

export function runPhase(
  tributes: TributeState[],
  phase: ArenaPhase,
  dayNumber: number,
): PhaseResult {
  const events: ResolvedEvent[] = [];
  const diedThisPhase: PhaseResult["diedThisPhase"] = [];
  const count = eventsPerPhase(phase, living(tributes).length);

  for (let i = 0; i < count; i++) {
    if (living(tributes).length <= 1) break;
    const ev = applyEvent(tributes, phase);
    if (!ev) break;
    events.push(ev);
    diedThisPhase.push(...ev.deaths);
  }

  // Force progress if somehow nobody died and many remain (late game)
  if (
    diedThisPhase.length === 0 &&
    living(tributes).length > 1 &&
    (phase === "finale" || living(tributes).length > 3 || Math.random() < 0.55)
  ) {
    // Guaranteed fatal attempt: pick two alive and kill one
    const aliveNow = shuffle(living(tributes));
    if (aliveNow.length >= 2) {
      const killer = aliveNow[0]!;
      const victim = aliveNow[1]!;
      const text = `**${killer.displayName}** ends **${victim.displayName}** in the ash — the arena demands blood.`;
      victim.alive = false;
      killer.kills += 1;
      const forced: ResolvedEvent = {
        text,
        kind: "kill",
        deaths: [{ userId: victim.userId, displayName: victim.displayName, text }],
        infected: [],
        cured: [],
        killerId: killer.userId,
      };
      events.push(forced);
      diedThisPhase.push(...forced.deaths);
    } else if (aliveNow.length === 1 && phase === "finale") {
      // Shouldn't happen; leave single victor
    } else {
      const ev = applyEvent(tributes, phase);
      if (ev) {
        events.push(ev);
        diedThisPhase.push(...ev.deaths);
      }
    }
  }

  const banter =
    Math.random() < 0.55
      ? BANTER_LINES[Math.floor(Math.random() * BANTER_LINES.length)]
      : undefined;

  return {
    phase,
    dayNumber,
    events,
    banter,
    diedThisPhase,
    aliveAfter: living(tributes),
    deadAfter: tributes.filter((t) => !t.alive),
  };
}

export function nextPhase(
  current: ArenaPhase,
  dayNumber: number,
  aliveCount: number,
): { phase: ArenaPhase; dayNumber: number } {
  if (aliveCount <= 2) return { phase: "finale", dayNumber };
  if (current === "bloodbath") return { phase: "day", dayNumber: 1 };
  if (current === "day") return { phase: "night", dayNumber };
  if (current === "night") {
    // Feast after night 2 (day 2 night complete → day 3 feast) or when half dead
    if (dayNumber === 2) return { phase: "feast", dayNumber: 3 };
    return { phase: "day", dayNumber: dayNumber + 1 };
  }
  if (current === "feast") return { phase: "night", dayNumber };
  if (current === "finale") return { phase: "finale", dayNumber };
  return { phase: "day", dayNumber: dayNumber + 1 };
}

export function tributesToState(rows: ArenaTribute[]): TributeState[] {
  return rows.map((t) => ({
    id: t.id,
    userId: t.userId,
    displayName: t.displayName,
    alive: t.alive,
    infected: t.infected,
    kills: t.kills,
  }));
}

export async function persistTributeStates(
  gameId: string,
  states: TributeState[],
  phase: string,
  dayNumber: number,
  deathTexts: Map<string, string>,
) {
  for (const t of states) {
    const newlyDead = !t.alive && deathTexts.has(t.userId);
    await prisma.arenaTribute.update({
      where: { id: t.id },
      data: {
        alive: t.alive,
        infected: t.infected,
        kills: t.kills,
        ...(newlyDead
          ? {
              diedDay: dayNumber,
              diedPhase: phase,
              deathText: deathTexts.get(t.userId),
            }
          : {}),
      },
    });
  }
}

export type ArenaGameFull = ArenaGame & { tributes: ArenaTribute[] };

export async function loadGame(gameId: string): Promise<ArenaGameFull | null> {
  return prisma.arenaGame.findUnique({
    where: { id: gameId },
    include: { tributes: true },
  });
}
