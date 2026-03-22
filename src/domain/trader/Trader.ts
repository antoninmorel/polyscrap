import { Schema } from "effect"
import { TraderId } from "./TraderId"
import { TraderMetrics } from "./TraderMetrics"

export const Trader = Schema.Struct({
  id: TraderId,
  username: Schema.OptionFromNullOr(Schema.String),
  profileImage: Schema.OptionFromNullOr(Schema.String),
  metrics: TraderMetrics
})

export type Trader = typeof Trader.Type
