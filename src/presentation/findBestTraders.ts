import { Console, Effect, Layer, Option } from "effect";
import {
  defaultWeights,
  findBestTraders,
  type ScoredTrader,
} from "../application/TraderScoringService";
import { PolymarketLeaderboardRepositoryLive } from "../infrastructure/polymarket/data-api/PolymarketLeaderboardRepository";
import { PolymarketTraderRepositoryLive } from "../infrastructure/polymarket/data-api/PolymarketTraderRepository";

/**
 * Format a scored trader for display
 */
const formatTrader = (st: ScoredTrader, rank: number): string => {
  const { trader, compositeScore, scores } = st;
  const username = Option.getOrElse(trader.username, () => "Anonymous");
  const metrics = trader.metrics;

  return `
┌─────────────────────────────────────────────────────────────────┐
│ #${rank} ${username.padEnd(54)}│
├─────────────────────────────────────────────────────────────────┤
│ Composite Score: ${compositeScore.toFixed(1).padStart(5)}/100                                  │
├─────────────────────────────────────────────────────────────────┤
│ METRICS                                                         │
│   ROI:          ${metrics.roi.toFixed(2).padStart(8)}%  (Score: ${scores.roi
    .toFixed(0)
    .padStart(3)})                    │
│   Win Rate:     ${metrics.winRate.toFixed(2).padStart(8)}%  (Score: ${scores.winRate
    .toFixed(0)
    .padStart(3)})                    │
│   Consistency:  ${(metrics.consistency * 100)
    .toFixed(1)
    .padStart(8)}%  (Score: ${scores.consistency.toFixed(0).padStart(3)})                    │
│   Total Trades: ${String(metrics.totalTrades).padStart(8)}                                    │
│   Volume:       $${metrics.totalVolume.toFixed(2).padStart(10)}  (Score: ${scores.volume
    .toFixed(0)
    .padStart(3)})                 │
│   Avg Trade:    $${metrics.avgTradeSize
    .toFixed(2)
    .padStart(10)}                                  │
│   Last Active:  ${metrics.lastActiveAt
    .toISOString()
    .slice(0, 10)
    .padStart(10)}  (Score: ${scores.recentActivity.toFixed(0).padStart(3)})                 │
│   PnL:          $${metrics.realizedPnl.toFixed(2).padStart(10)}                                  │
└─────────────────────────────────────────────────────────────────┘`;
};

/**
 * Main program
 */
const program = Effect.gen(function* () {
  yield* Console.log("═══════════════════════════════════════════════════════════════════");
  yield* Console.log("                    POLYMARKET TRADER ANALYZER                       ");
  yield* Console.log("═══════════════════════════════════════════════════════════════════");
  yield* Console.log("");
  yield* Console.log("Scoring Weights:");
  yield* Console.log(`  ROI:             ${(defaultWeights.roi * 100).toFixed(0)}%`);
  yield* Console.log(`  Win Rate:        ${(defaultWeights.winRate * 100).toFixed(0)}%`);
  yield* Console.log(`  Consistency:     ${(defaultWeights.consistency * 100).toFixed(0)}%`);
  yield* Console.log(`  Volume:          ${(defaultWeights.volume * 100).toFixed(0)}%`);
  yield* Console.log(`  Recent Activity: ${(defaultWeights.recentActivity * 100).toFixed(0)}%`);
  yield* Console.log("");
  yield* Console.log("Fetching leaderboard and analyzing traders...");
  yield* Console.log("");

  const scoredTraders = yield* findBestTraders(
    { timePeriod: "ALL", limit: 50 },
    defaultWeights,
    10,
  );

  if (scoredTraders.length === 0) {
    yield* Console.log("No traders found matching criteria.");
    return;
  }

  yield* Console.log(`Found ${scoredTraders.length} traders meeting criteria:\n`);

  for (let i = 0; i < scoredTraders.length; i++) {
    const trader = scoredTraders[i];
    if (trader) {
      yield* Console.log(formatTrader(trader, i + 1));
    }
  }

  yield* Console.log("");
  yield* Console.log("═══════════════════════════════════════════════════════════════════");
  yield* Console.log("                         ANALYSIS COMPLETE                          ");
  yield* Console.log("═══════════════════════════════════════════════════════════════════");
});

// Compose all layers
const AppLayer = Layer.mergeAll(
  PolymarketLeaderboardRepositoryLive,
  PolymarketTraderRepositoryLive,
);

// Run the program
const runnable = program.pipe(
  Effect.catchAll((error) => Console.error(`Error: ${error}`)),
  Effect.provide(AppLayer),
);

Effect.runPromise(runnable).catch(console.error);
