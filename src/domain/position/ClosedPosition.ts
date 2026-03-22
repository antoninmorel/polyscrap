import { Schema } from "effect";
import { USDAmount } from "../shared/types";
import { ConditionId } from "./ConditionId";

export const ClosedPosition = Schema.Struct({
  conditionId: ConditionId,
  title: Schema.String,
  slug: Schema.String,
  outcome: Schema.String,
  outcomeIndex: Schema.Number,
  avgPrice: Schema.Number,
  totalBought: USDAmount,
  realizedPnl: USDAmount,
  curPrice: Schema.Number,
  closedAt: Schema.DateFromNumber,
});

export type ClosedPosition = typeof ClosedPosition.Type;
