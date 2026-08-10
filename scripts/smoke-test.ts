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
  isBlackjack,
} from "../src/games/cards.js";
import {
  applyEvent,
  nextPhase,
  runPhase,
  TributeState,
} from "../src/hungergames/engine.js";
import { ARENA_EVENTS, fillTemplate } from "../src/hungergames/events.js";
import { loadCommands } from "../src/client.js";
import { theme } from "../src/theme.js";

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
    assert(handValue([{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }]) === 21, "BJ 21");
    assert(isBlackjack([{ rank: "A", suit: "♠" }, { rank: "K", suit: "♥" }]), "isBlackjack");
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
