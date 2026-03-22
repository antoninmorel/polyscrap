import { Context, Effect } from "effect";
import type { TraderId } from "./TraderId";
import type { ClosedPosition } from "../position/ClosedPosition";
import type { Activity } from "../position/Activity";
import type { TraderRepositoryError } from "./errors";

export interface ClosedPositionsQueryOptions {
  readonly limit?: number;
  readonly offset?: number;
}

export interface ActivityQueryOptions {
  readonly limit?: number;
}

export interface TraderRepository {
  readonly getClosedPositions: (
    traderId: TraderId,
    options?: ClosedPositionsQueryOptions,
  ) => Effect.Effect<ReadonlyArray<ClosedPosition>, TraderRepositoryError>;

  readonly getActivity: (
    traderId: TraderId,
    options?: ActivityQueryOptions,
  ) => Effect.Effect<ReadonlyArray<Activity>, TraderRepositoryError>;

  readonly getTotalMarketsTraded: (
    traderId: TraderId,
  ) => Effect.Effect<number, TraderRepositoryError>;
}

export const TraderRepository = Context.GenericTag<TraderRepository>("TraderRepository");
