import { Schema } from "effect"

export const TimePeriod = Schema.Literal("DAY", "WEEK", "MONTH", "ALL")
export type TimePeriod = typeof TimePeriod.Type

export const LeaderboardCategory = Schema.Literal(
  "OVERALL",
  "POLITICS",
  "SPORTS",
  "CRYPTO",
  "CULTURE",
  "MENTIONS",
  "WEATHER",
  "ECONOMICS",
  "TECH",
  "FINANCE"
)
export type LeaderboardCategory = typeof LeaderboardCategory.Type

export const LeaderboardOrderBy = Schema.Literal("PNL", "VOL")
export type LeaderboardOrderBy = typeof LeaderboardOrderBy.Type
