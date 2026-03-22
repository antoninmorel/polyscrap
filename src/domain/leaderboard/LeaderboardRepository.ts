import { Context, Effect } from "effect"
import type { LeaderboardCategory, LeaderboardOrderBy, TimePeriod } from "./types"
import type { LeaderboardEntry } from "./LeaderboardEntry"
import type { LeaderboardRepositoryError } from "./errors"

export interface LeaderboardQueryOptions {
  readonly category?: LeaderboardCategory
  readonly timePeriod?: TimePeriod
  readonly orderBy?: LeaderboardOrderBy
  readonly limit?: number
  readonly offset?: number
}

export interface LeaderboardRepository {
  readonly getLeaderboard: (
    options?: LeaderboardQueryOptions
  ) => Effect.Effect<ReadonlyArray<LeaderboardEntry>, LeaderboardRepositoryError>
}

export const LeaderboardRepository = Context.GenericTag<LeaderboardRepository>(
  "LeaderboardRepository"
)
