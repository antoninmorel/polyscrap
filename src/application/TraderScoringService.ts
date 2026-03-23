import {
  Array,
  DateTime,
  Duration,
  Effect,
  flow,
  Match,
  Number,
  Option,
  Order,
  pipe,
  Schema,
} from "effect";
import type { LeaderboardEntry } from "../domain/leaderboard/LeaderboardEntry";
import {
  LeaderboardRepository,
  type LeaderboardQueryOptions,
} from "../domain/leaderboard/LeaderboardRepository";
import type { LeaderboardRepositoryError } from "../domain/leaderboard/errors";
import type { ClosedPosition } from "../domain/position/ClosedPosition";
import { EthWalletAddress } from "../domain/shared/EthWalletAddress";
import { USDAmount } from "../domain/shared/types";
import * as MetricsCalculator from "../domain/trader/MetricsCalculator";
import type { Trader } from "../domain/trader/Trader";
import { TraderId } from "../domain/trader/TraderId";
import type { TraderMetrics } from "../domain/trader/TraderMetrics";
import { TraderRepository } from "../domain/trader/TraderRepository";
import {
  InsufficientDataError,
  TraderNotFoundError,
  TraderRepositoryError,
} from "../domain/trader/errors";

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
 * Fixed thresholds for single-trader assessment
 */
export interface FixedThresholds {
  readonly roi: { readonly min: number; readonly max: number };
  readonly winRate: { readonly min: number; readonly max: number };
  readonly volume: { readonly min: number; readonly max: number };
}

export const defaultFixedThresholds: FixedThresholds = {
  roi: { min: -50, max: 50 }, // -50% to +50% ROI
  winRate: { min: 30, max: 70 }, // 30% to 70% win rate
  volume: { min: 100, max: 100000 }, // $100 to $100k (log scale)
};

/**
 * Normalization strategy for score calculation
 */
export type NormalizationStrategy =
  | {
      readonly type: "relative";
      readonly allMetrics: ReadonlyArray<TraderMetrics>;
    }
  | { readonly type: "fixed"; readonly thresholds: FixedThresholds };

// =============================================================================
// Types
// =============================================================================

/**
 * Individual score breakdown
 */
export interface Scores {
  readonly roi: number;
  readonly winRate: number;
  readonly consistency: number;
  readonly volume: number;
  readonly recentActivity: number;
}

/**
 * Scored trader with composite score (for findBestTraders)
 */
export interface ScoredTrader {
  readonly trader: Trader;
  readonly compositeScore: number;
  readonly scores: Scores;
}

/**
 * Verdict for copy trade assessment
 */
export type CopyTradeVerdict = "Highly Recommended" | "Recommended" | "Neutral" | "Avoid";

/**
 * Full assessment result for a single trader
 */
export interface CopyTradeAssessment {
  readonly trader: Trader;
  readonly compositeScore: number;
  readonly scores: Scores;
  readonly verdict: CopyTradeVerdict;
  readonly reasons: ReadonlyArray<string>;
}

/**
 * Normalize a value to 0-100 scale using min-max normalization
 */
const normalize = (value: number, min: number, max: number): number => {
  if (max === min) return 50; // Default to middle if no variance
  return Number.clamp({ minimum: 0, maximum: 100 })(((value - min) / (max - min)) * 100);
};

/**
 * Calculate recency score based on last activity date
 * More recent activity = higher score
 * Decays over 30 days to 0
 */
const calculateRecencyScore = (lastActiveAt: Date) =>
  Effect.gen(function* () {
    const now = yield* DateTime.now;
    const lastActive = yield* DateTime.make(lastActiveAt).pipe(
      Effect.orDieWith(() => "Invalid last active date"),
    );

    const daysSinceActive = DateTime.distanceDuration(now, lastActive).pipe(Duration.toDays);

    if (daysSinceActive <= 1) return 100;
    if (daysSinceActive >= 30) return 0;

    // Linear decay from 100 to 0 over 30 days
    return Math.max(0, 100 - (daysSinceActive / 30) * 100);
  });

/**
 * Build a Trader from LeaderboardEntry and their closed positions
 */
const buildTrader = (entry: LeaderboardEntry, positions: ReadonlyArray<ClosedPosition>) =>
  Effect.gen(function* () {
    // Get last active date from most recent position
    const lastActiveAt = yield* Array.match(positions, {
      onEmpty: () => DateTime.nowAsDate,
      onNonEmpty: (nonEmptyPositions) =>
        pipe(
          nonEmptyPositions,
          Array.map((p) => p.closedAt),
          Array.max(Order.Date),
          Effect.succeed,
        ),
    });

    const metrics = MetricsCalculator.calculateMetrics(positions, lastActiveAt);

    return {
      id: entry.traderId,
      username: entry.username,
      metrics,
    };
  });

/**
 * Get verdict based on composite score
 * >= 80: Highly Recommended
 * >= 70: Recommended
 * >= 60: Neutral
 * < 60: Avoid
 */
const getVerdict = (score: number): CopyTradeVerdict =>
  Match.value(score).pipe(
    Match.when(Number.greaterThan(80), () => "Highly Recommended" as const),
    Match.when(Number.greaterThan(70), () => "Recommended" as const),
    Match.when(Number.greaterThan(60), () => "Neutral" as const),
    Match.orElse(() => "Avoid" as const),
  );

/**
 * Generate human-readable reasons based on scores
 */
const generateReasons = (scores: Scores): ReadonlyArray<string> => {
  const reasons: string[] = [];

  if (scores.roi >= 70) reasons.push("Strong ROI performance");
  else if (scores.roi < 40) reasons.push("Poor ROI performance");

  if (scores.winRate >= 70) reasons.push("Excellent win rate");
  else if (scores.winRate < 40) reasons.push("Low win rate");

  if (scores.consistency >= 70) reasons.push("Consistent returns");
  else if (scores.consistency < 40) reasons.push("Inconsistent performance");

  if (scores.recentActivity >= 70) reasons.push("Recently active");
  else if (scores.recentActivity < 30) reasons.push("Inactive for extended period");

  if (scores.volume >= 70) reasons.push("High trading volume");
  else if (scores.volume < 30) reasons.push("Low trading volume");

  return reasons;
};

// =============================================================================
// Core Scoring Functions
// =============================================================================

/**
 * Calculate scores for a trader using the specified normalization strategy
 */
const calculateScores = (
  trader: Trader,
  weights: ScoringWeights,
  strategy: NormalizationStrategy,
) =>
  Effect.gen(function* () {
    const metrics = trader.metrics;

    // Determine min/max based on strategy
    const { roiMin, roiMax, winRateMin, winRateMax, volumeMin, volumeMax } = Match.value(
      strategy,
    ).pipe(
      Match.when({ type: "relative" }, ({ allMetrics }) => ({
        roiMin: Math.min(...allMetrics.map((m) => m.roi)),
        roiMax: Math.max(...allMetrics.map((m) => m.roi)),
        winRateMin: Math.min(...allMetrics.map((m) => m.winRate)),
        winRateMax: Math.max(...allMetrics.map((m) => m.winRate)),
        volumeMin: Math.min(...allMetrics.map((m) => m.totalVolume)),
        volumeMax: Math.max(...allMetrics.map((m) => m.totalVolume)),
      })),
      Match.when({ type: "fixed" }, ({ thresholds }) => ({
        roiMin: thresholds.roi.min,
        roiMax: thresholds.roi.max,
        winRateMin: thresholds.winRate.min,
        winRateMax: thresholds.winRate.max,
        volumeMin: thresholds.volume.min,
        volumeMax: thresholds.volume.max,
      })),
      Match.exhaustive,
    );

    // Normalize individual scores
    const roiScore = normalize(metrics.roi, roiMin, roiMax);
    const winRateScore = normalize(metrics.winRate, winRateMin, winRateMax);
    const consistencyScore = metrics.consistency * 100; // Already 0-1, scale to 0-100
    const volumeScore = normalize(
      Math.log(metrics.totalVolume + 1), // Log scale for volume
      Math.log(volumeMin + 1),
      Math.log(volumeMax + 1),
    );
    const recencyScore = yield* calculateRecencyScore(metrics.lastActiveAt);

    // Calculate weighted composite score
    const compositeScore =
      roiScore * weights.roi +
      winRateScore * weights.winRate +
      consistencyScore * weights.consistency +
      volumeScore * weights.volume +
      recencyScore * weights.recentActivity;

    const scores: Scores = {
      roi: roiScore,
      winRate: winRateScore,
      consistency: consistencyScore,
      volume: volumeScore,
      recentActivity: recencyScore,
    };

    return { compositeScore, scores };
  });

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
      return yield* new InsufficientDataError({
        traderId: entry.traderId,
        reason: "Not enough trades",
        actual: positions.length,
        required: MIN_TRADES,
      });
    }

    const totalVolume = positions.reduce((sum, p) => sum + p.totalBought, 0);
    if (totalVolume < MIN_VOLUME) {
      return yield* new InsufficientDataError({
        traderId: entry.traderId,
        reason: "Insufficient volume",
        actual: totalVolume,
        required: MIN_VOLUME,
      });
    }

    return yield* buildTrader(entry, positions);
  });

// =============================================================================
// Public API
// =============================================================================

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
      flow(
        fetchTraderDetails,
        Effect.map(Option.some),
        Effect.catchTag("InsufficientDataError", () => Effect.succeed(Option.none<Trader>())),
      ),
      { concurrency: 5 },
    );

    const traders = Array.getSomes(tradersWithDetails);

    if (!Array.isNonEmptyReadonlyArray(traders)) return [];

    // Calculate scores for all traders using relative normalization
    const allMetrics = traders.map((t) => t.metrics);
    const scoredTraders = yield* Effect.forEach(traders, (t) =>
      Effect.map(calculateScores(t, weights, { type: "relative", allMetrics }), (result) => ({
        trader: t,
        ...result,
      })),
    );

    // Sort by composite score descending and take top N
    const sorted = Array.sortWith(
      scoredTraders,
      (st) => st.compositeScore,
      Order.reverse(Order.number),
    );

    return Array.take(sorted, maxTraders);
  });

/**
 * Assess whether a trader is good to copy based on username or wallet address
 */
export const assessCopyTrader = (
  identifier: string,
  weights: ScoringWeights = defaultWeights,
  thresholds: FixedThresholds = defaultFixedThresholds,
): Effect.Effect<
  CopyTradeAssessment,
  TraderNotFoundError | TraderRepositoryError | InsufficientDataError | LeaderboardRepositoryError,
  LeaderboardRepository | TraderRepository
> =>
  Effect.gen(function* () {
    const leaderboardRepo = yield* LeaderboardRepository;
    const traderRepo = yield* TraderRepository;

    const walletAddressOption = Schema.validateOption(EthWalletAddress)(identifier);

    const entry = yield* Option.match(walletAddressOption, {
      onSome: (walletAddress) =>
        Effect.succeed(
          Option.some({
            rank: 0,
            traderId: walletAddress as TraderId,
            username: Option.none(),
            volume: USDAmount.make(0),
            pnl: USDAmount.make(0),
            verifiedBadge: false,
          }),
        ),
      // It's a username - look it up in the leaderboard
      onNone: () => leaderboardRepo.findByUsername(identifier),
    });

    if (Option.isNone(entry)) {
      return yield* new TraderNotFoundError({
        identifier,
        identifierType: Option.isSome(walletAddressOption) ? "traderId" : "username",
      });
    }

    const leaderboardEntry = entry.value;

    // Fetch positions
    const positions = yield* traderRepo.getClosedPositions(leaderboardEntry.traderId, {
      limit: 50,
    });

    // Check minimum requirements
    if (positions.length < MIN_TRADES) {
      return yield* new InsufficientDataError({
        traderId: leaderboardEntry.traderId,
        reason: "Not enough trades",
        actual: positions.length,
        required: MIN_TRADES,
      });
    }

    const totalVolume = positions.reduce((sum, p) => sum + p.totalBought, 0);
    if (totalVolume < MIN_VOLUME) {
      return yield* new InsufficientDataError({
        traderId: leaderboardEntry.traderId,
        reason: "Insufficient volume",
        actual: totalVolume,
        required: MIN_VOLUME,
      });
    }

    // Build trader
    const trader = yield* buildTrader(leaderboardEntry, positions);

    // Calculate scores with fixed thresholds
    const { compositeScore, scores } = yield* calculateScores(trader, weights, {
      type: "fixed",
      thresholds,
    });

    const verdict = getVerdict(compositeScore);
    const reasons = generateReasons(scores);

    return {
      trader,
      compositeScore,
      scores,
      verdict,
      reasons,
    };
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
      return yield* new InsufficientDataError({
        traderId,
        reason: "Not enough trades",
        actual: positions.length,
        required: MIN_TRADES,
      });
    }

    const lastActiveAt = yield* Array.match(positions, {
      onEmpty: () => DateTime.nowAsDate,
      onNonEmpty: (nonEmptyPositions) =>
        pipe(
          nonEmptyPositions,
          Array.map((p) => p.closedAt),
          Array.max(Order.Date),
          Effect.succeed,
        ),
    });

    const metrics = MetricsCalculator.calculateMetrics(positions, lastActiveAt);

    const trader: Trader = {
      id: traderId,
      username: Option.none(),
      metrics,
    };

    return { trader, positions };
  });
