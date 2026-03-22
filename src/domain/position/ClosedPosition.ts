import { Schema } from "effect"
import { ConditionId } from "./ConditionId"
import { USDAmount } from "../shared/types"

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
  closedAt: Schema.Date
})

export type ClosedPosition = typeof ClosedPosition.Type
