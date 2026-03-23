import { Console, Effect, Layer, Match, Option } from "effect";
import {
  assessCopyTrader,
  defaultWeights,
  type CopyTradeAssessment,
  type CopyTradeVerdict,
} from "../application/TraderScoringService";
import { PolymarketLeaderboardRepositoryLive } from "../infrastructure/polymarket/data-api/PolymarketLeaderboardRepository";
import { PolymarketTraderRepositoryLive } from "../infrastructure/polymarket/data-api/PolymarketTraderRepository";

/**
 * Get verdict display string with visual indicator
 */
const getVerdictDisplay = (verdict: CopyTradeVerdict): string =>
  Match.value(verdict).pipe(
    Match.when("Highly Recommended", () => "[++] HIGHLY RECOMMENDED"),
    Match.when("Recommended", () => "[+] RECOMMENDED"),
    Match.when("Neutral", () => "[~] NEUTRAL"),
    Match.when("Avoid", () => "[-] AVOID"),
    Match.exhaustive,
  );

/**
 * Format the assessment result for CLI display
 */
const formatAssessment = (assessment: CopyTradeAssessment): string => {
  const { trader, compositeScore, scores, verdict, reasons } = assessment;
  const username = Option.getOrElse(trader.username, () => "Anonymous");
  const metrics = trader.metrics;
  const shortAddress = `${trader.id.slice(0, 10)}...${trader.id.slice(-8)}`;

  const reasonsFormatted =
    reasons.length > 0
      ? reasons.map((r) => `|   - ${r.padEnd(57)}|`).join("\n")
      : "|   No specific notes                                          |";

  return `
+---------------------------------------------------------------+
| TRADER: ${username.padEnd(54)}|
| Address: ${shortAddress.padEnd(53)}|
+---------------------------------------------------------------+
| COMPOSITE SCORE: ${compositeScore.toFixed(1).padStart(5)}/100                                  |
| VERDICT: ${getVerdictDisplay(verdict).padEnd(53)}|
+---------------------------------------------------------------+
| DETAILED BREAKDOWN                                            |
|   ROI:             ${metrics.roi >= 0 ? "+" : ""}${metrics.roi.toFixed(1).padStart(6)}%   (Score: ${scores.roi.toFixed(0).padStart(3)}/100)            |
|   Win Rate:        ${metrics.winRate.toFixed(1).padStart(7)}%   (Score: ${scores.winRate.toFixed(0).padStart(3)}/100)            |
|   Consistency:     ${(metrics.consistency * 100).toFixed(1).padStart(7)}%   (Score: ${scores.consistency.toFixed(0).padStart(3)}/100)            |
|   Volume:        $${metrics.totalVolume.toFixed(0).padStart(8)}   (Score: ${scores.volume.toFixed(0).padStart(3)}/100)            |
|   Last Active:   ${metrics.lastActiveAt.toISOString().slice(0, 10)}   (Score: ${scores.recentActivity.toFixed(0).padStart(3)}/100)            |
|   Total Trades:  ${String(metrics.totalTrades).padStart(10)}                                  |
|   Realized PnL:  $${metrics.realizedPnl.toFixed(2).padStart(9)}                                  |
+---------------------------------------------------------------+
| ANALYSIS                                                      |
${reasonsFormatted}
+---------------------------------------------------------------+`;
};

/**
 * Main program
 */
const program = Effect.gen(function* () {
  const identifier = process.argv[2];

  if (!identifier) {
    yield* Console.error("Usage: bun assess-trader <username|wallet_address>");
    yield* Console.error("");
    yield* Console.error("Examples:");
    yield* Console.error("  bun assess-trader CryptoWhale");
    yield* Console.error("  bun assess-trader 0x1234567890abcdef1234567890abcdef12345678");
    return;
  }

  yield* Console.log("===============================================================");
  yield* Console.log("                    COPY TRADER ASSESSMENT                      ");
  yield* Console.log("===============================================================");
  yield* Console.log("");
  yield* Console.log(`Analyzing: ${identifier}`);
  yield* Console.log("");
  yield* Console.log("Scoring Weights:");
  yield* Console.log(`  ROI:             ${(defaultWeights.roi * 100).toFixed(0)}%`);
  yield* Console.log(`  Win Rate:        ${(defaultWeights.winRate * 100).toFixed(0)}%`);
  yield* Console.log(`  Consistency:     ${(defaultWeights.consistency * 100).toFixed(0)}%`);
  yield* Console.log(`  Volume:          ${(defaultWeights.volume * 100).toFixed(0)}%`);
  yield* Console.log(`  Recent Activity: ${(defaultWeights.recentActivity * 100).toFixed(0)}%`);
  yield* Console.log("");
  yield* Console.log("Fetching trader data...");
  yield* Console.log("");

  const assessment = yield* assessCopyTrader(identifier, defaultWeights);

  yield* Console.log(formatAssessment(assessment));

  yield* Console.log("");
  yield* Console.log("===============================================================");
  yield* Console.log("                      ASSESSMENT COMPLETE                       ");
  yield* Console.log("===============================================================");
});

// Compose all layers
const AppLayer = Layer.mergeAll(
  PolymarketLeaderboardRepositoryLive,
  PolymarketTraderRepositoryLive,
);

// Run the program with error handling
const runnable = program.pipe(
  Effect.catchTag("TraderNotFoundError", (e) =>
    Console.error(`Trader not found: "${e.identifier}" (searched by ${e.identifierType})`),
  ),
  Effect.catchTag("InsufficientDataError", (e) =>
    Console.error(
      `Insufficient data for trader: ${e.reason} (found ${e.actual}, need ${e.required})`,
    ),
  ),
  Effect.catchTag("TraderRepositoryError", (e) => Console.error(`Repository error: ${e.message}`)),
  Effect.catchTag("LeaderboardRepositoryError", (e) =>
    Console.error(`Leaderboard error: ${e.message}`),
  ),
  Effect.catchAll((error) => Console.error(`Error: ${error}`)),
  Effect.provide(AppLayer),
);

Effect.runPromise(runnable).catch(console.error);
