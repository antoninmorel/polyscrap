import { Schema } from "effect";
import { ClosedPosition } from "../../../../domain/position/ClosedPosition";
import { ConditionId } from "../../../../domain/position/ConditionId";
import { USDAmount } from "../../../../domain/shared/types";

// API response shape from Polymarket Data API /closed-positions
const ClosedPositionApi = Schema.Struct({
  conditionId: Schema.String,
  title: Schema.String,
  slug: Schema.String,
  outcome: Schema.String,
  outcomeIndex: Schema.Number,
  avgPrice: Schema.Number,
  totalBought: Schema.Number,
  realizedPnl: Schema.Number,
  curPrice: Schema.Number,
  timestamp: Schema.Number, // Unix timestamp in seconds
});

export const ClosedPositionFromApi = Schema.transform(ClosedPositionApi, ClosedPosition, {
  strict: true,
  decode: (api) => ({
    conditionId: api.conditionId as ConditionId,
    title: api.title,
    slug: api.slug,
    outcome: api.outcome,
    outcomeIndex: api.outcomeIndex,
    avgPrice: api.avgPrice,
    totalBought: USDAmount.make(api.totalBought),
    realizedPnl: USDAmount.make(api.realizedPnl),
    curPrice: api.curPrice,
    closedAt: api.timestamp * 1000, // DateFromNumber expects milliseconds
  }),
  encode: (domain) => ({
    conditionId: domain.conditionId,
    title: domain.title,
    slug: domain.slug,
    outcome: domain.outcome,
    outcomeIndex: domain.outcomeIndex,
    avgPrice: domain.avgPrice,
    totalBought: domain.totalBought,
    realizedPnl: domain.realizedPnl,
    curPrice: domain.curPrice,
    timestamp: domain.closedAt / 1000, // Convert back to seconds
  }),
});

export const ClosedPositionApiResponse = Schema.Array(ClosedPositionFromApi);
export type ClosedPositionApiResponse = typeof ClosedPositionApiResponse.Type;
