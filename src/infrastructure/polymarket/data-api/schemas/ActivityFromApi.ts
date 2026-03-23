import { Option, Schema } from "effect";
import { Activity } from "../../../../domain/position/Activity";
import { ConditionId } from "../../../../domain/position/ConditionId";
import { ActivityType, TradeSide } from "../../../../domain/position/types";
import { USDAmount } from "../../../../domain/shared/types";

// API response shape from Polymarket Data API /activity
const ActivityApi = Schema.Struct({
  type: Schema.String,
  timestamp: Schema.Number, // Unix timestamp in seconds
  conditionId: Schema.String,
  size: Schema.Number,
  usdcSize: Schema.Number,
  price: Schema.NullOr(Schema.Number),
  side: Schema.NullOr(Schema.String),
  title: Schema.String,
  outcome: Schema.String,
  transactionHash: Schema.NullOr(Schema.String),
});

export const ActivityFromApi = Schema.transform(ActivityApi, Activity, {
  strict: true,
  decode: (api) => ({
    type: api.type as ActivityType,
    timestamp: api.timestamp * 1000, // DateFromNumber expects milliseconds
    conditionId: api.conditionId as ConditionId,
    size: api.size,
    usdcSize: USDAmount.make(api.usdcSize),
    price: api.price,
    side: Schema.validateOption(TradeSide)(api.side).pipe(Option.getOrNull),
    title: api.title,
    outcome: api.outcome,
    transactionHash: api.transactionHash,
  }),
  encode: (domain) => ({
    type: domain.type,
    timestamp: domain.timestamp / 1000, // Convert back to seconds
    conditionId: domain.conditionId,
    size: domain.size,
    usdcSize: domain.usdcSize,
    price: domain.price,
    side: domain.side,
    title: domain.title,
    outcome: domain.outcome,
    transactionHash: domain.transactionHash,
  }),
});

export const ActivityApiResponse = Schema.Array(ActivityFromApi);
export type ActivityApiResponse = typeof ActivityApiResponse.Type;
