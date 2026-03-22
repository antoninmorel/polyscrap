import { Schema } from "effect"
import { ConditionId } from "./ConditionId"
import { USDAmount } from "../shared/types"
import { ActivityType, TradeSide } from "./types"

export const Activity = Schema.Struct({
  type: ActivityType,
  timestamp: Schema.Date,
  conditionId: ConditionId,
  size: Schema.Number,
  usdcSize: USDAmount,
  price: Schema.OptionFromNullOr(Schema.Number),
  side: Schema.OptionFromNullOr(TradeSide),
  title: Schema.String,
  outcome: Schema.String,
  transactionHash: Schema.OptionFromNullOr(Schema.String)
})

export type Activity = typeof Activity.Type
