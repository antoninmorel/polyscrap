import { Schema } from "effect";
import { TraderId } from "../trader/TraderId";
import { USDAmount } from "../shared/types";

export const LeaderboardEntry = Schema.Struct({
  rank: Schema.NumberFromString,
  traderId: TraderId,
  username: Schema.OptionFromNullOr(Schema.String),
  volume: USDAmount,
  pnl: USDAmount,
  verifiedBadge: Schema.optionalWith(Schema.Boolean, { default: () => false }),
});

export type LeaderboardEntry = typeof LeaderboardEntry.Type;
