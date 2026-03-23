import { Effect, Layer, Option, TestClock, TestContext } from "effect";
import { describe, expect, it } from "vitest";
import type { LeaderboardEntry } from "../domain/leaderboard/LeaderboardEntry";
import { LeaderboardRepository } from "../domain/leaderboard/LeaderboardRepository";
import type { ClosedPosition } from "../domain/position/ClosedPosition";
import type { ConditionId } from "../domain/position/ConditionId";
import type { USDAmount } from "../domain/shared/types";
import type { TraderId } from "../domain/trader/TraderId";
import { TraderRepository } from "../domain/trader/TraderRepository";
import {
  analyzeTrader,
  assessCopyTrader,
  defaultWeights,
  findBestTraders,
  type ScoringWeights,
} from "./TraderScoringService";

// =============================================================================
// Test Helpers
// =============================================================================

// Valid Ethereum wallet addresses for testing
const TEST_WALLETS = {
  trader1: "0x1234567890abcdef1234567890abcdef12345678",
  trader2: "0xabcdef1234567890abcdef1234567890abcdef12",
  trader3: "0x0000000000000000000000000000000000000001",
  trader4: "0x0000000000000000000000000000000000000002",
  trader5: "0x0000000000000000000000000000000000000003",
  recent: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  old: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
} as const;

const makeTraderId = (key: keyof typeof TEST_WALLETS): TraderId => TEST_WALLETS[key] as TraderId;
const makeConditionId = (id: string): ConditionId => id as ConditionId;
const makeUSDAmount = (amount: number): USDAmount => amount as USDAmount;

const makeClosedPosition = (
  overrides: Partial<{
    conditionId: string;
    title: string;
    realizedPnl: number;
    totalBought: number;
    closedAt: Date;
  }> = {},
): ClosedPosition => ({
  conditionId: makeConditionId(overrides.conditionId ?? "condition-1"),
  title: overrides.title ?? "Test Market",
  slug: "test-market",
  outcome: "Yes",
  outcomeIndex: 0,
  avgPrice: 0.5,
  totalBought: makeUSDAmount(overrides.totalBought ?? 100),
  realizedPnl: makeUSDAmount(overrides.realizedPnl ?? 10),
  curPrice: 0.6,
  closedAt: overrides.closedAt ?? new Date("2026-03-20"),
});

const makeLeaderboardEntry = (
  overrides: Partial<{
    rank: number;
    traderId: keyof typeof TEST_WALLETS;
    username: string | null;
    volume: number;
    pnl: number;
  }> = {},
): LeaderboardEntry => ({
  rank: overrides.rank ?? 1,
  traderId: makeTraderId(overrides.traderId ?? "trader1"),
  username: Option.fromNullable(overrides.username ?? "TestTrader"),
  volume: makeUSDAmount(overrides.volume ?? 10000),
  pnl: makeUSDAmount(overrides.pnl ?? 1000),
  verifiedBadge: false,
});

const makePositions = (
  count: number,
  winRate: number = 0.7,
  avgPnl: number = 10,
  avgVolume: number = 100,
  baseDate: Date = new Date("2026-03-20"),
): ReadonlyArray<ClosedPosition> =>
  Array.from({ length: count }, (_, i) => {
    const isWin = i < count * winRate;
    return makeClosedPosition({
      conditionId: `condition-${i}`,
      title: `Market ${i}`,
      realizedPnl: isWin ? avgPnl : -avgPnl * 0.5,
      totalBought: avgVolume,
      closedAt: new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000), // 1 day apart
    });
  });

// =============================================================================
// Mock Repositories
// =============================================================================

const makeTestLeaderboardRepository = (entries: ReadonlyArray<LeaderboardEntry>) =>
  Layer.succeed(LeaderboardRepository, {
    getLeaderboard: () => Effect.succeed(entries),
    findByUsername: (username: string) =>
      Effect.succeed(
        Option.fromNullable(
          entries.find(
            (e) =>
              Option.isSome(e.username) &&
              e.username.value.toLowerCase() === username.toLowerCase(),
          ),
        ),
      ),
  });

const makeTestTraderRepository = (
  positionsByTrader: Record<string, ReadonlyArray<ClosedPosition>>,
) =>
  Layer.succeed(TraderRepository, {
    getClosedPositions: (traderId) => Effect.succeed(positionsByTrader[traderId] ?? []),
    getActivity: () => Effect.succeed([]),
    getTotalMarketsTraded: (traderId) => Effect.succeed(positionsByTrader[traderId]?.length ?? 0),
  });

const runWithTestClock = <A, E>(
  effect: Effect.Effect<A, E, LeaderboardRepository | TraderRepository>,
  leaderboardEntries: ReadonlyArray<LeaderboardEntry>,
  positionsByTrader: Record<string, ReadonlyArray<ClosedPosition>>,
  currentTime: Date = new Date("2026-03-22"),
) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(currentTime.getTime());
    return yield* effect;
  }).pipe(
    Effect.provide(makeTestLeaderboardRepository(leaderboardEntries)),
    Effect.provide(makeTestTraderRepository(positionsByTrader)),
    Effect.provide(TestContext.TestContext),
    Effect.runPromise,
  );

// =============================================================================
// Tests
// =============================================================================

describe("TraderScoringService", () => {
  describe("findBestTraders", () => {
    it("should return empty array when no traders meet minimum requirements", async () => {
      const entries = [makeLeaderboardEntry({ traderId: "trader1" })];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(5), // Less than MIN_TRADES (10)
      };

      const result = await runWithTestClock(findBestTraders(), entries, positionsByTrader);

      expect(result).toEqual([]);
    });

    it("should return scored traders sorted by composite score descending", async () => {
      const entries = [
        makeLeaderboardEntry({ traderId: "trader1", username: "HighROI" }),
        makeLeaderboardEntry({ traderId: "trader2", username: "LowROI" }),
      ];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.8, 20, 100), // High win rate, high PnL
        [TEST_WALLETS.trader2]: makePositions(15, 0.5, 5, 100), // Lower win rate, lower PnL
      };

      const result = await runWithTestClock(findBestTraders(), entries, positionsByTrader);

      expect(result).toHaveLength(2);
      expect(result[0]?.trader.id).toBe(TEST_WALLETS.trader1);
      expect(result[1]?.trader.id).toBe(TEST_WALLETS.trader2);
      expect(result[0]?.compositeScore).toBeGreaterThan(result[1]?.compositeScore ?? 0);
    });

    it("should respect maxTraders limit", async () => {
      const traderKeys = ["trader1", "trader2", "trader3", "trader4", "trader5"] as const;
      const entries = traderKeys.map((key, i) =>
        makeLeaderboardEntry({ traderId: key, rank: i + 1 }),
      );
      const positionsByTrader = Object.fromEntries(
        traderKeys.map((key) => [TEST_WALLETS[key], makePositions(15)]),
      );

      const result = await runWithTestClock(
        findBestTraders({}, defaultWeights, 3),
        entries,
        positionsByTrader,
      );

      expect(result).toHaveLength(3);
    });

    it("should filter out traders with insufficient volume", async () => {
      const entries = [
        makeLeaderboardEntry({ traderId: "trader1" }),
        makeLeaderboardEntry({ traderId: "trader2" }),
      ];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.7, 10, 100), // Good volume
        [TEST_WALLETS.trader2]: makePositions(15, 0.7, 10, 5), // Low volume (5 * 15 = 75 < 100)
      };

      const result = await runWithTestClock(findBestTraders(), entries, positionsByTrader);

      expect(result).toHaveLength(1);
      expect(result[0]?.trader.id).toBe(TEST_WALLETS.trader1);
    });

    it("should calculate individual scores correctly", async () => {
      const entries = [makeLeaderboardEntry({ traderId: "trader1" })];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 1.0, 10, 100), // 100% win rate
      };

      const result = await runWithTestClock(findBestTraders(), entries, positionsByTrader);

      expect(result).toHaveLength(1);
      const scores = result[0]?.scores;

      // With only one trader, normalized scores should be 50 (middle) for ROI, winRate, volume
      expect(scores?.roi).toBe(50);
      expect(scores?.winRate).toBe(50);
      expect(scores?.volume).toBe(50);
      // Consistency should be high for consistent returns
      expect(scores?.consistency).toBeGreaterThan(80);
    });

    it("should apply custom weights correctly", async () => {
      const entries = [
        makeLeaderboardEntry({ traderId: "trader1" }),
        makeLeaderboardEntry({ traderId: "trader2" }),
      ];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.9, 5, 100), // High win rate, low ROI
        [TEST_WALLETS.trader2]: makePositions(15, 0.5, 20, 100), // Low win rate, high ROI
      };

      // Weight heavily towards win rate
      const winRateFocusedWeights: ScoringWeights = {
        roi: 0.1,
        winRate: 0.6,
        consistency: 0.1,
        volume: 0.1,
        recentActivity: 0.1,
      };

      const result = await runWithTestClock(
        findBestTraders({}, winRateFocusedWeights),
        entries,
        positionsByTrader,
      );

      expect(result[0]?.trader.id).toBe(TEST_WALLETS.trader1); // Higher win rate should win
    });

    it("should give higher recency score to recently active traders", async () => {
      const now = new Date("2026-03-22");
      const entries = [
        makeLeaderboardEntry({ traderId: "recent" }),
        makeLeaderboardEntry({ traderId: "old" }),
      ];
      const positionsByTrader = {
        [TEST_WALLETS.recent]: makePositions(15, 0.7, 10, 100, new Date("2026-03-21")), // Yesterday
        [TEST_WALLETS.old]: makePositions(15, 0.7, 10, 100, new Date("2026-02-01")), // 49 days ago
      };

      const result = await runWithTestClock(findBestTraders(), entries, positionsByTrader, now);

      const recentTrader = result.find((t) => t.trader.id === TEST_WALLETS.recent);
      const oldTrader = result.find((t) => t.trader.id === TEST_WALLETS.old);

      expect(recentTrader!.scores.recentActivity).toBeGreaterThan(oldTrader!.scores.recentActivity);
    });
  });

  describe("analyzeTrader", () => {
    it("should return trader with metrics and positions", async () => {
      const traderId = makeTraderId("trader1");
      const positions = makePositions(15, 0.7, 10, 100);
      const positionsByTrader = { [TEST_WALLETS.trader1]: positions };

      const result = await analyzeTrader(traderId).pipe(
        Effect.provide(makeTestTraderRepository(positionsByTrader)),
        Effect.provide(TestContext.TestContext),
        Effect.runPromise,
      );

      expect(result.trader.id).toBe(traderId);
      expect(result.positions).toHaveLength(15);
      expect(result.trader.metrics.totalTrades).toBe(15);
    });

    it("should fail with InsufficientDataError when not enough trades", async () => {
      const traderId = makeTraderId("trader1");
      const positionsByTrader = { [TEST_WALLETS.trader1]: makePositions(5) };

      const result = await analyzeTrader(traderId).pipe(
        Effect.provide(makeTestTraderRepository(positionsByTrader)),
        Effect.provide(TestContext.TestContext),
        Effect.flip,
        Effect.runPromise,
      );

      expect(result._tag).toBe("InsufficientDataError");
      if (result._tag === "InsufficientDataError") {
        expect(result.reason).toBe("Not enough trades");
        expect(result.actual).toBe(5);
        expect(result.required).toBe(10);
      }
    });

    it("should calculate correct ROI", async () => {
      const traderId = makeTraderId("trader1");
      // 10 positions, all winning $10 on $100 investment = 10% ROI
      const positions = Array.from({ length: 10 }, (_, i) =>
        makeClosedPosition({
          conditionId: `c-${i}`,
          totalBought: 100,
          realizedPnl: 10,
        }),
      );
      const positionsByTrader = { [TEST_WALLETS.trader1]: positions };

      const result = await analyzeTrader(traderId).pipe(
        Effect.provide(makeTestTraderRepository(positionsByTrader)),
        Effect.provide(TestContext.TestContext),
        Effect.runPromise,
      );

      expect(result.trader.metrics.roi).toBe(10); // 10% ROI
    });

    it("should calculate correct win rate", async () => {
      const traderId = makeTraderId("trader1");
      // 10 positions, 7 winning
      const positions = Array.from({ length: 10 }, (_, i) =>
        makeClosedPosition({
          conditionId: `c-${i}`,
          realizedPnl: i < 7 ? 10 : -5,
        }),
      );
      const positionsByTrader = { [TEST_WALLETS.trader1]: positions };

      const result = await analyzeTrader(traderId).pipe(
        Effect.provide(makeTestTraderRepository(positionsByTrader)),
        Effect.provide(TestContext.TestContext),
        Effect.runPromise,
      );

      expect(result.trader.metrics.winRate).toBe(70); // 70% win rate
    });
  });

  describe("assessCopyTrader", () => {
    it("should assess a trader by username", async () => {
      const entries = [makeLeaderboardEntry({ traderId: "trader1", username: "GoodTrader" })];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.8, 20, 200), // Good performance
      };

      const result = await runWithTestClock(
        assessCopyTrader("GoodTrader"),
        entries,
        positionsByTrader,
      );

      expect(result.trader.id).toBe(TEST_WALLETS.trader1);
      expect(Option.getOrNull(result.trader.username)).toBe("GoodTrader");
      expect(result.compositeScore).toBeGreaterThan(0);
      expect(result.verdict).toBeDefined();
      expect(result.reasons.length).toBeGreaterThan(0);
    });

    it("should assess a trader by wallet address", async () => {
      const entries: LeaderboardEntry[] = [];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.8, 20, 200),
      };

      const result = await runWithTestClock(
        assessCopyTrader(TEST_WALLETS.trader1),
        entries,
        positionsByTrader,
      );

      expect(result.trader.id).toBe(TEST_WALLETS.trader1);
      expect(result.compositeScore).toBeGreaterThan(0);
    });

    it("should return Avoid verdict for poor performers", async () => {
      const entries = [makeLeaderboardEntry({ traderId: "trader1", username: "BadTrader" })];
      // Create positions with poor performance:
      // - Low win rate (~27%)
      // - Very low ROI (nearly break-even, ~1%)
      // - Old activity (40 days ago) - score 0
      // - Small volume
      // - Inconsistent returns
      const oldDate = new Date("2026-02-10"); // 40 days before test date
      const badPositions = Array.from({ length: 15 }, (_, i) =>
        makeClosedPosition({
          conditionId: `condition-${i}`,
          title: `Market ${i}`,
          // 4 wins of $10, 11 losses of varying small amounts, net slightly positive
          realizedPnl: i < 4 ? 10 : -(3 + (i % 2)), // 4 wins of 10, losses of 3-4 each
          totalBought: 50,
          closedAt: new Date(oldDate.getTime() - i * 24 * 60 * 60 * 1000),
        }),
      );
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: badPositions,
      };

      const result = await runWithTestClock(
        assessCopyTrader("BadTrader"),
        entries,
        positionsByTrader,
      );

      // Score should be below 60 due to: low win rate, low ROI, no recent activity (0), low volume
      expect(result.compositeScore).toBeLessThan(60);
      expect(result.verdict).toBe("Avoid");
    });

    it("should fail with TraderNotFoundError for unknown username", async () => {
      const entries: LeaderboardEntry[] = [];
      const positionsByTrader = {};

      const result = await Effect.gen(function* () {
        yield* TestClock.setTime(new Date("2026-03-22").getTime());
        return yield* assessCopyTrader("UnknownUser");
      }).pipe(
        Effect.provide(makeTestLeaderboardRepository(entries)),
        Effect.provide(makeTestTraderRepository(positionsByTrader)),
        Effect.provide(TestContext.TestContext),
        Effect.flip,
        Effect.runPromise,
      );

      expect(result._tag).toBe("TraderNotFoundError");
      if (result._tag === "TraderNotFoundError") {
        expect(result.identifier).toBe("UnknownUser");
        expect(result.identifierType).toBe("username");
      }
    });

    it("should be case-insensitive for username lookup", async () => {
      const entries = [makeLeaderboardEntry({ traderId: "trader1", username: "CryptoWhale" })];
      const positionsByTrader = {
        [TEST_WALLETS.trader1]: makePositions(15, 0.7, 10, 100),
      };

      const result = await runWithTestClock(
        assessCopyTrader("cryptowhale"), // lowercase
        entries,
        positionsByTrader,
      );

      expect(result.trader.id).toBe(TEST_WALLETS.trader1);
    });
  });

  describe("defaultWeights", () => {
    it("should sum to 1.0", () => {
      const sum =
        defaultWeights.roi +
        defaultWeights.winRate +
        defaultWeights.consistency +
        defaultWeights.volume +
        defaultWeights.recentActivity;

      expect(sum).toBe(1.0);
    });
  });
});
