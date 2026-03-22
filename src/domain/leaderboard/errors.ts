import { Data } from "effect"

export class LeaderboardRepositoryError extends Data.TaggedError("LeaderboardRepositoryError")<{
  readonly cause: unknown
  readonly message: string
}> {}
