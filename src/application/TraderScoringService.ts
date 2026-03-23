import { Effect, Option, Order, Array as Arr } from "effect";
import type { LeaderboardEntry } from "../domain/leaderboard/LeaderboardEntry";
import {
  LeaderboardRepository,
  type LeaderboardQueryOptions,
} from "../domain/leaderboard/LeaderboardRepository";
import type { LeaderboardRepositoryError } from "../domain/leaderboard/errors";
import type { ClosedPosition } from "../domain/position/ClosedPosition";
import type { Trader } from "../domain/trader/Trader";
import { InsufficientDataError, TraderRepositoryError } from "../domain/trader/errors";
import * as MetricsCalculator from "../domain/trader/MetricsCalculator";
import type { TraderId } from "../domain/trader/TraderId";
import { TraderRepository } from "../domain/trader/TraderRepository";
import type { TraderMetrics } from "../domain/trader/TraderMetrics";

// Minimum requirements for a trader to be considered
const MIN_TRADES = 10;
const MIN_VOLUME = 100; // $100 minimum volume

/**
 * Weights for the composite score calculation
 * Sum should equal 1.0
 */
export interface ScoringWeights {
  readonly roi: number;
  readonly winRate: number;
  readonly consistency: number;
  readonly volume: number;
  readonly recentActivity: number;
}

export const defaultWeights: ScoringWeights = {
  roi: 0.3,
  winRate: 0.25,
  consistency: 0.2,
  volume: 0.15,
  recentActivity: 0.1,
};

/**
 * Scored trader with composite score
 */
export interface ScoredTrader {
  readonly trader: Trader;
  readonly compositeScore: number;
  readonly scores: {
    readonly roi: number;
    readonly winRate: number;
    readonly consistency: number;
    readonly volume: number;
    readonly recentActivity: number;
  };
}

/**
 * Normalize a value to 0-100 scale using min-max normalization
 */
const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 50; // Default to middle if no variance
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
};

/**
 * Calculate recency score based on last activity date
 * More recent activity = higher score
 * Decays over 30 days to 0
 */
const calculateRecencyScore = (lastActiveAt: Date): number => {
  const now = new Date();
  const daysSinceActive = (now.getTime() - lastActiveAt.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceActive <= 1) return 100;
  if (daysSinceActive >= 30) return 0;

  // Linear decay from 100 to 0 over 30 days
  return Math.max(0, 100 - (daysSinceActive / 30) * 100);
};

/**
 * Build a Trader from LeaderboardEntry and their closed positions
 */
const buildTrader = (entry: LeaderboardEntry, positions: ReadonlyArray<ClosedPosition>): Trader => {
  // Get last active date from most recent position
  const lastActiveAt =
    positions.length > 0
      ? new Date(Math.max(...positions.map((p) => p.closedAt.getTime())))
      : new Date();

  const metrics = MetricsCalculator.calculateMetrics(positions, lastActiveAt);

  return {
    id: entry.traderId,
    username: entry.username,
    profileImage: entry.profileImage,
    metrics,
  };
};

/**
 * Fetch trader details and build Trader from LeaderboardEntry
 */
const fetchTraderDetails = (
  entry: LeaderboardEntry,
): Effect.Effect<Trader, TraderRepositoryError | InsufficientDataError, TraderRepository> =>
  Effect.gen(function* () {
    const traderRepo = yield* TraderRepository;

    // Fetch all closed positions (paginated if needed)
    const positions = yield* traderRepo.getClosedPositions(entry.traderId, {
      limit: 50,
    });

    // Check minimum requirements
    if (positions.length < MIN_TRADES) {
      return yield* Effect.fail(
        new InsufficientDataError({
          traderId: entry.traderId,
          reason: "Not enough trades",
          actual: positions.length,
          required: MIN_TRADES,
        }),
      );
    }

    const totalVolume = positions.reduce((sum, p) => sum + p.totalBought, 0);
    if (totalVolume < MIN_VOLUME) {
      return yield* Effect.fail(
        new InsufficientDataError({
          traderId: entry.traderId,
          reason: "Insufficient volume",
          actual: totalVolume,
          required: MIN_VOLUME,
        }),
      );
    }

    return buildTrader(entry, positions);
  });

/**
 * Calculate composite score for a trader
 */
const calculateScores = (
  trader: Trader,
  allMetrics: ReadonlyArray<TraderMetrics>,
  weights: ScoringWeights,
): ScoredTrader => {
  const metrics = trader.metrics;

  // Get min/max for normalization across all traders
  const rois = allMetrics.map((m) => m.roi);
  const winRates = allMetrics.map((m) => m.winRate);
  const volumes = allMetrics.map((m) => m.totalVolume);

  // Normalize individual scores
  const roiScore = normalize(metrics.roi, Math.min(...rois), Math.max(...rois));
  const winRateScore = normalize(metrics.winRate, Math.min(...winRates), Math.max(...winRates));
  const consistencyScore = metrics.consistency * 100; // Already 0-1, scale to 0-100
  const volumeScore = normalize(
    Math.log(metrics.totalVolume + 1), // Log scale for volume
    Math.log(Math.min(...volumes) + 1),
    Math.log(Math.max(...volumes) + 1),
  );
  const recencyScore = calculateRecencyScore(metrics.lastActiveAt);

  // Calculate weighted composite score
  const compositeScore =
    roiScore * weights.roi +
    winRateScore * weights.winRate +
    consistencyScore * weights.consistency +
    volumeScore * weights.volume +
    recencyScore * weights.recentActivity;

  return {
    trader,
    compositeScore,
    scores: {
      roi: roiScore,
      winRate: winRateScore,
      consistency: consistencyScore,
      volume: volumeScore,
      recentActivity: recencyScore,
    },
  };
};

/**
 * Find the best traders to copy based on leaderboard data and detailed analysis
 */
export const findBestTraders = (
  options: LeaderboardQueryOptions = {},
  weights: ScoringWeights = defaultWeights,
  maxTraders: number = 10,
): Effect.Effect<
  ReadonlyArray<ScoredTrader>,
  LeaderboardRepositoryError | TraderRepositoryError,
  LeaderboardRepository | TraderRepository
> =>
  Effect.gen(function* () {
    const leaderboardRepo = yield* LeaderboardRepository;

    // Fetch leaderboard entries
    const entries = yield* leaderboardRepo.getLeaderboard({
      ...options,
      limit: Math.max(options.limit ?? 50, maxTraders * 3), // Fetch more to account for filtering
    });

    // Fetch details for each trader, filtering out those with insufficient data
    const tradersWithDetails = yield* Effect.forEach(
      entries,
      (entry) =>
        fetchTraderDetails(entry).pipe(
          Effect.map((trader) => Option.some(trader)),
          Effect.catchTag("InsufficientDataError", () => {
            // Log the skip for visibility
            return Effect.succeed(Option.none<Trader>());
          }),
        ),
      { concurrency: 5 }, // Limit concurrent requests
    );

    // Filter out None values
    const traders = Arr.filterMap(tradersWithDetails, (opt) => opt);

    if (traders.length === 0) {
      return [];
    }

    // Calculate scores for all traders
    const allMetrics = traders.map((t) => t.metrics);
    const scoredTraders = traders.map((t) => calculateScores(t, allMetrics, weights));

    // Sort by composite score descending and take top N
    const sorted = Arr.sort(
      scoredTraders,
      Order.reverse(Order.mapInput(Order.number, (st: ScoredTrader) => st.compositeScore)),
    );

    return Arr.take(sorted, maxTraders);
  });

/**
 * Get detailed analysis for a specific trader
 */
export const analyzeTrader = (
  traderId: TraderId,
): Effect.Effect<
  { trader: Trader; positions: ReadonlyArray<ClosedPosition> },
  TraderRepositoryError | InsufficientDataError,
  TraderRepository
> =>
  Effect.gen(function* () {
    const traderRepo = yield* TraderRepository;

    const positions = yield* traderRepo.getClosedPositions(traderId, {
      limit: 50,
    });

    if (positions.length < MIN_TRADES) {
      return yield* Effect.fail(
        new InsufficientDataError({
          traderId,
          reason: "Not enough trades",
          actual: positions.length,
          required: MIN_TRADES,
        }),
      );
    }

    const lastActiveAt =
      positions.length > 0
        ? new Date(Math.max(...positions.map((p) => p.closedAt.getTime())))
        : new Date();

    const metrics = MetricsCalculator.calculateMetrics(positions, lastActiveAt);

    const trader: Trader = {
      id: traderId,
      username: Option.none(),
      profileImage: Option.none(),
      metrics,
    };

    return { trader, positions };
  });
