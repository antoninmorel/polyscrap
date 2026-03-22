import { Schema } from "effect";

export const ActivityType = Schema.Literal(
  "TRADE",
  "SPLIT",
  "MERGE",
  "REDEEM",
  "REWARD",
  "CONVERSION",
  "MAKER_REBATE",
);
export type ActivityType = typeof ActivityType.Type;

export const TradeSide = Schema.Literal("BUY", "SELL");
export type TradeSide = typeof TradeSide.Type;
