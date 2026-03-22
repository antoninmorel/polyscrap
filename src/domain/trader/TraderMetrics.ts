import { Schema } from "effect"
import { Percentage, USDAmount } from "../shared/types"

export const TraderMetrics = Schema.Struct({
  roi: Percentage,
  winRate: Percentage,
  totalTrades: Schema.Number,
  totalVolume: USDAmount,
  realizedPnl: USDAmount,
  consistency: Schema.Number,
  avgTradeSize: USDAmount,
  lastActiveAt: Schema.Date
})

export type TraderMetrics = typeof TraderMetrics.Type
