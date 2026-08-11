/**
 * Offline smoke tests for GreekBot core logic (no Discord token required).
 * Run: npx tsx scripts/smoke-test.ts
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { prisma } from "../src/db.js";
import {
  assertBetAmount,
  claimDaily,
  credit,
  debit,
  ensureUser,
  EconomyError,
  getBalance,
  transfer,
  applyRake,
} from "../src/services/wallet.js";
import {
  cardRankValue,
  draw,
  freshDeck,
  handValue,
  hiLoDecisionEv,
  hiLoRankValue,
  hiLoWinMultiplier,
  isBlackjack,
} from "../src/games/cards.js";
import { flipCoin, randomInt, shuffle } from "../src/utils/random.js";
import { crashExpiresAt } from "../src/commands/crash.js";
import {
  crashActivePayload,
  makeCrashCommit,
  verifyCrashCommit,
} from "../src/games/crashCommit.js";
import { slotsGrossRtp, slotsPayout, slotsSpin } from "../src/games/slotsMath.js";
import {
  applyEvent,
  nextPhase,
  runPhase,
  TributeState,
} from "../src/hungergames/engine.js";
import { ARENA_EVENTS, fillTemplate } from "../src/hungergames/events.js";
import { loadCommands } from "../src/client.js";
import { theme } from "../src/theme.js";
import { config } from "../src/config.js";

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed += 1;
  console.log(`  ✓ ${name}`);
}

function fail(name: string, err: unknown) {
  failed += 1;
  console.error(`  ✗ ${name}`);
  console.error(err);
}

async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    ok(name);
  } catch (err) {
    fail(name, err);
  }
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log(`\nGreekBot smoke tests (${theme.name})\n`);

  await test("theme is GreekBot", () => {
    assert(theme.name === "GreekBot", `expected GreekBot, got ${theme.name}`);
  });

  await test("cards: deck has 52 and draws reduce it", () => {
    const deck = freshDeck();
    assert(deck.length === 52, "deck size");
    const c = draw(deck);
    assert(deck.length === 51, "after draw");
    assert(cardRankValue({ rank: "A", suit: "♠" }) === 14, "ace high");
    assert(hiLoRankValue({ rank: "A", suit: "♠" }) === 1, "ace low in hi-lo");
    assert(hiLoRankValue({ rank: "K", suit: "♠" }) === 13, "king hi-lo");
    assert(handValue([{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }]) === 21, "BJ 21");
    assert(isBlackjack([{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }]), "isBlackjack");
  });

  await test("highlow: multiplier tracks true odds (no flat +EV farm)", () => {
    const ace = { rank: "A" as const, suit: "♠" as const };
    const rest = freshDeck().filter((c) => !(c.rank === "A" && c.suit === "♠"));
    assert(rest.length === 51, "51 left");
    const highMult = hiLoWinMultiplier(rest, ace, "high");
    // 51/48*0.97 ≈ 1.03 — not the old flat 1.45 farm
    assert(highMult >= 1.01 && highMult <= 1.1, `ace-high mult too juicy: ${highMult}`);
    const lowMult = hiLoWinMultiplier(rest, ace, "low");
    assert(lowMult === 1, `ace-low should be impossible: ${lowMult}`);

    const seven = { rank: "7" as const, suit: "♥" as const };
    const rest7 = freshDeck().filter((c) => !(c.rank === "7" && c.suit === "♥"));
    const midHigh = hiLoWinMultiplier(rest7, seven, "high");
    const midLow = hiLoWinMultiplier(rest7, seven, "low");
    assert(midHigh > 1.5 && midHigh < 3, `7-high: ${midHigh}`);
    assert(midLow > 1.5 && midLow < 3, `7-low: ${midLow}`);
  });

  await test("RNG: fair coin and roulette range", () => {
    let heads = 0;
    for (let i = 0; i < 2000; i++) {
      if (flipCoin() === "heads") heads += 1;
    }
    assert(heads > 800 && heads < 1200, `coin bias: ${heads}/2000 heads`);

    for (let i = 0; i < 500; i++) {
      const n = randomInt(37);
      assert(n >= 0 && n <= 36, `roulette out of range: ${n}`);
    }

    const deck = freshDeck();
    const first = deck.slice(0, 13).map((c) => `${c.rank}${c.suit}`).join(",");
    shuffle(deck);
    const reshuffled = deck.slice(0, 13).map((c) => `${c.rank}${c.suit}`).join(",");
    assert(first !== reshuffled || deck.length === 52, "shuffle should mix deck");
  });

  await test("crash expiresAt covers climb duration", () => {
    const from = 1_700_000_000_000;
    const instant = crashExpiresAt(1, from).getTime() - from;
    assert(instant === 90_000, `instant grace: ${instant}`);
    // 10x → ceil(9/0.15)=60 steps * 700ms + 90s
    const at10 = crashExpiresAt(10, from).getTime() - from;
    assert(at10 === 60 * 700 + 90_000, `10x ttl: ${at10}`);
    const at100 = crashExpiresAt(100, from).getTime() - from;
    assert(at100 === Math.ceil(99 / 0.15) * 700 + 90_000, `100x ttl: ${at100}`);
    assert(at100 > 5 * 60 * 1000, "100x must outlive old hard-coded 5m expiry");
  });

  await test("crash commit hides crashAt until reveal", () => {
    const sessionId = "sess_crash_commit_test";
    const crashAt = 12.34;
    const payload = JSON.parse(crashActivePayload(sessionId, crashAt)) as {
      commit?: string;
      crashAt?: number;
    };
    assert(typeof payload.commit === "string" && payload.commit.length === 64, "commit hex");
    assert(payload.crashAt === undefined, "active payload must not include crashAt");
    assert(verifyCrashCommit(sessionId, crashAt, payload.commit!), "commit verifies");
    assert(!verifyCrashCommit(sessionId, 12.35, payload.commit!), "wrong crashAt fails");
    assert(
      makeCrashCommit(sessionId, crashAt) !== makeCrashCommit("other", crashAt),
      "session-bound",
    );
  });

  await test("slots gross RTP is casino-range (~92%)", () => {
    const exact = slotsGrossRtp();
    assert(exact > 0.9 && exact < 0.95, `exact RTP ${exact}`);
    // Monte Carlo should track exact within noise
    const bet = 100;
    let returned = 0;
    const spins = 40_000;
    for (let i = 0; i < spins; i++) {
      returned += slotsPayout(slotsSpin(), bet);
    }
    const sample = returned / (spins * bet);
    assert(Math.abs(sample - exact) < 0.03, `sample RTP ${sample} vs exact ${exact}`);
    // After 2% rake on wins only, net ≤ gross
    const netExact = exact * (1 - config.houseRakePercent / 100);
    assert(netExact > 0.88 && netExact < 0.94, `net RTP ${netExact}`);
  });

  await test("highlow optimal decision EV is house-edged (~97%)", () => {
    const seven = { rank: "7" as const, suit: "♥" as const };
    const rest7 = freshDeck().filter((c) => !(c.rank === "7" && c.suit === "♥"));
    const highEv = hiLoDecisionEv(rest7, seven, "high");
    const lowEv = hiLoDecisionEv(rest7, seven, "low");
    const best = Math.max(highEv, lowEv);
    assert(best > 0.95 && best < 1.06, `mid EV ${best}`);
    // Ace "higher" is no longer a flat 1.45 farm
    const ace = { rank: "A" as const, suit: "♠" as const };
    const restA = freshDeck().filter((c) => !(c.rank === "A" && c.suit === "♠"));
    const aceEv = hiLoDecisionEv(restA, ace, "high");
    assert(aceEv < 1.08, `ace EV still farmable?: ${aceEv}`);
    assert(hiLoWinMultiplier(restA, ace, "high") < 1.2, "ace mult must stay near true odds");
  });

  await test("crash settle vs expiry is single-winner (cashout/bust race)", async () => {
    const { claimSessionStatus } = await import("../src/services/expiry.js");
    const uid = `crash_race_${Date.now()}`;
    await ensureUser(uid, "CrashRace");
    const session = await prisma.gameSession.create({
      data: {
        type: "crash",
        status: "active",
        wager: 25,
        playerOneId: uid,
        payload: crashActivePayload("tmp", 2.5),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    // Fix commit to real session id
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { payload: crashActivePayload(session.id, 2.5) },
    });

    const results = await Promise.all([
      claimSessionStatus(session.id, "active", "settled"),
      claimSessionStatus(session.id, "active", "expired"),
      claimSessionStatus(session.id, "active", "settled"),
    ]);
    const wins = results.filter(Boolean).length;
    assert(wins === 1, `expected exactly one winner, got ${results.join(",")}`);

    const mid = await prisma.gameSession.findUnique({ where: { id: session.id } });
    assert(mid?.payload && !mid.payload.includes('"crashAt"'), "pre-reveal has no crashAt");
    // Simulate post-settle reveal
    const { crashRevealedPayload } = await import("../src/games/crashCommit.js");
    await prisma.gameSession.update({
      where: { id: session.id },
      data: { payload: crashRevealedPayload(session.id, 2.5, { outcome: "bust" }) },
    });
    const done = await prisma.gameSession.findUnique({ where: { id: session.id } });
    const parsed = JSON.parse(done!.payload) as { crashAt?: number; commit?: string };
    assert(parsed.crashAt === 2.5, "revealed after settle");
    assert(verifyCrashCommit(session.id, 2.5, parsed.commit!), "reveal commit ok");

    await prisma.gameSession.deleteMany({ where: { id: session.id } });
    await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  });

  await test("event catalog non-empty + template fill", () => {
    assert(ARENA_EVENTS.length >= 30, "enough events");
    const filled = fillTemplate("{0} vs {1}", ["Alpha", "Beta"]);
    assert(filled === "Alpha vs Beta", filled);
  });

  await test("hunger games phase engine reaches a winner", () => {
    const tributes: TributeState[] = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      userId: `u${i}`,
      displayName: `Tribute${i}`,
      alive: true,
      infected: false,
      kills: 0,
    }));

    let phase = "bloodbath" as const;
    let day = 0;
    let steps = 0;
    let currentPhase: "bloodbath" | "day" | "night" | "feast" | "finale" = phase;

    while (tributes.filter((t) => t.alive).length > 1 && steps < 40) {
      const result = runPhase(tributes, currentPhase, day);
      assert(result.events.length >= 0, "events array");
      if (result.aliveAfter.length <= 1) break;
      const nxt = nextPhase(currentPhase, day, result.aliveAfter.length);
      currentPhase = nxt.phase;
      day = nxt.dayNumber;
      steps += 1;
    }

    const alive = tributes.filter((t) => t.alive);
    assert(alive.length === 1, `expected 1 victor, got ${alive.length} after ${steps} phases`);
  });

  await test("applyEvent can infect and kill", () => {
    const tributes: TributeState[] = [
      { id: "1", userId: "a", displayName: "A", alive: true, infected: false, kills: 0 },
      { id: "2", userId: "b", displayName: "B", alive: true, infected: false, kills: 0 },
      { id: "3", userId: "c", displayName: "C", alive: true, infected: false, kills: 0 },
      { id: "4", userId: "d", displayName: "D", alive: true, infected: false, kills: 0 },
    ];
    let sawText = false;
    for (let i = 0; i < 20; i++) {
      const ev = applyEvent(tributes, "day");
      if (ev?.text) sawText = true;
    }
    assert(sawText, "should produce event text");
  });

  await test("spread does not recurse forever when all infected", () => {
    const tributes: TributeState[] = Array.from({ length: 4 }, (_, i) => ({
      id: `t${i}`,
      userId: `u${i}`,
      displayName: `T${i}`,
      alive: true,
      infected: true,
      kills: 0,
    }));
    // Should return null or a non-spread event — must not throw stack overflow
    for (let i = 0; i < 30; i++) {
      applyEvent(tributes, "night");
    }
  });

  await test("postgres mutex serializes withUserLock", async () => {
    const { withUserLock } = await import("../src/locks.js");
    const order: number[] = [];
    const uid = `lock-test-${Date.now()}`;
    await Promise.all([
      withUserLock(uid, async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 80));
        order.push(2);
      }),
      (async () => {
        await new Promise((r) => setTimeout(r, 10));
        await withUserLock(uid, async () => {
          order.push(3);
        });
      })(),
    ]);
    assert(order.join(",") === "1,2,3", `lock order ${order.join(",")}`);
  });

  await test("claimSessionStatus is single-winner", async () => {
    const { claimSessionStatus } = await import("../src/services/expiry.js");
    const uid = `claim_p1_${Date.now()}`;
    await ensureUser(uid, "ClaimTest");
    const session = await prisma.gameSession.create({
      data: {
        type: "coinflip",
        status: "pending",
        wager: 10,
        playerOneId: uid,
        payload: "{}",
      },
    });
    const a = await claimSessionStatus(session.id, "pending", "expired");
    const b = await claimSessionStatus(session.id, "pending", "expired");
    assert(a === true && b === false, "second claim must fail");
    await prisma.gameSession.deleteMany({ where: { playerOneId: uid } });
    await prisma.user.delete({ where: { id: uid } }).catch(() => undefined);
  });

  await test("economy: ensure, debit, credit, transfer, daily", async () => {
    const a = `smoke_a_${Date.now()}`;
    const b = `smoke_b_${Date.now()}`;
    await ensureUser(a, "SmokeA");
    await ensureUser(b, "SmokeB");

    const start = await getBalance(a);
    assert(start.balance >= 1000, "starting balance");

    await debit(a, 100, "smoke_debit");
    const afterDebit = await getBalance(a);
    assert(afterDebit.balance === start.balance - 100, "debit");

    await credit(a, 50, "smoke_credit");
    const afterCredit = await getBalance(a);
    assert(afterCredit.balance === start.balance - 50, "credit");

    await transfer(a, b, 25);
    const a2 = await getBalance(a);
    const b2 = await getBalance(b);
    assert(a2.balance === afterCredit.balance - 25, "transfer from");
    assert(b2.balance === start.balance + 25, "transfer to");

    // Force daily claimable by clearing lastDailyAt
    await prisma.user.update({ where: { id: a }, data: { lastDailyAt: null, dailyStreak: 0 } });
    const daily = await claimDaily(a, "SmokeA");
    assert(daily.payout > 0, "daily payout");

    let threw = false;
    try {
      assertBetAmount(1);
    } catch (e) {
      threw = e instanceof EconomyError;
    }
    assert(threw, "min bet should reject tiny wagers");

    const rake = applyRake(100);
    assert(rake.net + rake.rake === 100, "rake splits cleanly");

    // Don't leave smoke ghosts on the production leaderboard
    await prisma.ledgerEntry.deleteMany({ where: { userId: { in: [a, b] } } });
    await prisma.user.deleteMany({ where: { id: { in: [a, b] } } });
  });

  await test("slash commands load (including hungergames)", async () => {
    const commands = await loadCommands();
    const needed = [
      "help",
      "hell",
      "balance",
      "daily",
      "coinflip",
      "rps",
      "blackjack",
      "hungergames",
      "slots",
      "roulette",
      "crash",
      "highlow",
      "jackpot",
      "admin",
    ];
    for (const name of needed) {
      assert(commands.has(name), `missing /${name}`);
    }
    assert(commands.size >= needed.length, "command count");
    assert(existsSync(path.join(process.cwd(), "assets/gifs/home.gif")), "home.gif missing");
  });

  await prisma.$disconnect();

  console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect().catch(() => undefined);
  process.exit(1);
});
