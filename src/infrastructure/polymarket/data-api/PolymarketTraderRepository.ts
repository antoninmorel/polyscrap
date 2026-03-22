import { FetchHttpClient, HttpClient } from "@effect/platform";
import { Cache, Data, Effect, Layer, Schema } from "effect";
import { Activity } from "../../../domain/position/Activity";
import { ClosedPosition } from "../../../domain/position/ClosedPosition";
import { TraderRepositoryError } from "../../../domain/trader/errors";
import type { TraderId } from "../../../domain/trader/TraderId";
import {
  TraderRepository,
  type ActivityQueryOptions,
  type ClosedPositionsQueryOptions,
} from "../../../domain/trader/TraderRepository";
import { DataApiConfig, DataApiConfigLive } from "./DataApiConfig";
import { TradedApiResponse } from "./schemas/TradedFromApi";
import { buildUrl } from "./utils";

// Cache keys using Data.case for proper structural equality
const ClosedPositionsCacheKey = Data.case<{
  readonly traderId: string;
  readonly limit: number;
  readonly offset: number;
}>();

const ActivityCacheKey = Data.case<{
  readonly traderId: string;
  readonly limit: number;
}>();

const TradedCacheKey = Data.case<{
  readonly traderId: string;
}>();

type ClosedPositionsCacheKey = ReturnType<typeof ClosedPositionsCacheKey>;
type ActivityCacheKey = ReturnType<typeof ActivityCacheKey>;
type TradedCacheKey = ReturnType<typeof TradedCacheKey>;

const make = Effect.gen(function* () {
  const config = yield* DataApiConfig;
  const httpClient = yield* HttpClient.HttpClient;

  // Fetch closed positions from API
  const fetchClosedPositions = (
    key: ClosedPositionsCacheKey,
  ): Effect.Effect<ReadonlyArray<ClosedPosition>, TraderRepositoryError> =>
    httpClient
      .get(
        buildUrl(config.baseUrl, "/closed-positions", {
          user: key.traderId,
          limit: key.limit,
          offset: key.offset,
        }),
      )
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknown(Schema.Array(ClosedPosition))),
        Effect.timeout(config.timeoutMs),
        Effect.mapError(
          TraderRepositoryError.fromCause(
            key.traderId as TraderId,
            `Failed to fetch closed positions for ${key.traderId}`,
          ),
        ),
      );

  // Fetch activity from API
  const fetchActivity = (
    key: ActivityCacheKey,
  ): Effect.Effect<ReadonlyArray<Activity>, TraderRepositoryError> =>
    httpClient
      .get(
        buildUrl(config.baseUrl, "/activity", {
          user: key.traderId,
          limit: key.limit,
        }),
      )
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknown(Schema.Array(Activity))),
        Effect.timeout(config.timeoutMs),
        Effect.mapError(
          TraderRepositoryError.fromCause(
            key.traderId as TraderId,
            `Failed to fetch activity for ${key.traderId}`,
          ),
        ),
      );

  // Fetch total markets traded from API
  const fetchTotalMarketsTraded = (
    key: TradedCacheKey,
  ): Effect.Effect<number, TraderRepositoryError> =>
    httpClient
      .get(
        buildUrl(config.baseUrl, "/traded", {
          user: key.traderId,
        }),
      )
      .pipe(
        Effect.flatMap((response) => response.json),
        Effect.flatMap(Schema.decodeUnknown(TradedApiResponse)),
        Effect.map((result) => result.traded),
        Effect.timeout(config.timeoutMs),
        Effect.mapError(
          TraderRepositoryError.fromCause(
            key.traderId as TraderId,
            `Failed to fetch total markets traded for ${key.traderId}`,
          ),
        ),
      );

  // Create caches
  const closedPositionsCache = yield* Cache.make({
    capacity: 500,
    timeToLive: config.cacheTtl,
    lookup: fetchClosedPositions,
  });

  const activityCache = yield* Cache.make({
    capacity: 500,
    timeToLive: config.cacheTtl,
    lookup: fetchActivity,
  });

  const tradedCache = yield* Cache.make({
    capacity: 500,
    timeToLive: config.cacheTtl,
    lookup: fetchTotalMarketsTraded,
  });

  // Repository methods
  const getClosedPositions = (
    traderId: TraderId,
    options: ClosedPositionsQueryOptions = {},
  ): Effect.Effect<ReadonlyArray<ClosedPosition>, TraderRepositoryError> =>
    closedPositionsCache.get(
      ClosedPositionsCacheKey({
        traderId,
        limit: options.limit ?? 50,
        offset: options.offset ?? 0,
      }),
    );

  const getActivity = (
    traderId: TraderId,
    options: ActivityQueryOptions = {},
  ): Effect.Effect<ReadonlyArray<Activity>, TraderRepositoryError> =>
    activityCache.get(
      ActivityCacheKey({
        traderId,
        limit: options.limit ?? 500,
      }),
    );

  const getTotalMarketsTraded = (
    traderId: TraderId,
  ): Effect.Effect<number, TraderRepositoryError> => tradedCache.get(TradedCacheKey({ traderId }));

  return TraderRepository.of({
    getClosedPositions,
    getActivity,
    getTotalMarketsTraded,
  });
});

export const PolymarketTraderRepositoryLive = Layer.effect(TraderRepository, make).pipe(
  Layer.provide(FetchHttpClient.layer),
  Layer.provide(DataApiConfigLive),
);
