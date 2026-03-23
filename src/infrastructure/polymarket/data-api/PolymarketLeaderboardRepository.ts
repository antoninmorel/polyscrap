import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Array, Cache, Data, Effect, Layer, Option, Schema } from "effect";
import type { LeaderboardEntry } from "../../../domain/leaderboard/LeaderboardEntry";
import {
  LeaderboardRepository,
  type LeaderboardQueryOptions,
} from "../../../domain/leaderboard/LeaderboardRepository";
import { LeaderboardRepositoryError } from "../../../domain/leaderboard/errors";
import { DataApiConfig, DataApiConfigLive } from "./DataApiConfig";
import { buildUrl } from "./buildUrl";
import { LeaderboardApiResponse } from "./schemas/LeaderboardEntryFromApi";

// Cache key using Data.case for proper structural equality
const LeaderboardCacheKey = Data.case<{
  readonly category: string;
  readonly timePeriod: string;
  readonly orderBy: string;
  readonly limit: number;
  readonly offset: number;
}>();

type LeaderboardCacheKey = ReturnType<typeof LeaderboardCacheKey>;

const make = Effect.gen(function* () {
  const config = yield* DataApiConfig;
  const httpClient = yield* HttpClient.HttpClient;

  const fetchLeaderboard = (
    key: LeaderboardCacheKey,
  ): Effect.Effect<ReadonlyArray<LeaderboardEntry>, LeaderboardRepositoryError> =>
    httpClient
      .get(
        buildUrl(config.baseUrl, "/v1/leaderboard", {
          category: key.category,
          timePeriod: key.timePeriod,
          orderBy: key.orderBy,
          limit: key.limit,
          offset: key.offset,
        }),
      )
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknown(LeaderboardApiResponse)),
        Effect.timeout(config.timeoutMs),
        Effect.mapError(LeaderboardRepositoryError.fromCause("Failed to fetch leaderboard")),
      );

  const cache = yield* Cache.make({
    capacity: 100,
    timeToLive: config.cacheTtl,
    lookup: fetchLeaderboard,
  });

  const getLeaderboard = (
    options: LeaderboardQueryOptions = {},
  ): Effect.Effect<ReadonlyArray<LeaderboardEntry>, LeaderboardRepositoryError> =>
    cache.get(
      LeaderboardCacheKey({
        category: options.category ?? "OVERALL",
        timePeriod: options.timePeriod ?? "DAY",
        orderBy: options.orderBy ?? "PNL",
        limit: options.limit ?? 25,
        offset: options.offset ?? 0,
      }),
    );

  const findByUsername = (
    username: string,
  ): Effect.Effect<Option.Option<LeaderboardEntry>, LeaderboardRepositoryError> =>
    Effect.gen(function* () {
      const normalizedUsername = username.toLowerCase();

      const found = yield* getLeaderboard({
        timePeriod: "ALL",
        limit: 500,
      }).pipe(
        Effect.map(
          Array.findFirst(
            (entry) =>
              Option.isSome(entry.username) &&
              entry.username.value.toLowerCase() === normalizedUsername,
          ),
        ),
      );

      return found;
    });

  return LeaderboardRepository.of({ getLeaderboard, findByUsername });
});

export const PolymarketLeaderboardRepositoryLive = Layer.effect(LeaderboardRepository, make).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(DataApiConfigLive),
);
