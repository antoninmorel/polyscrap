import { Data } from "effect"
import type { TraderId } from "./TraderId"

export class TraderRepositoryError extends Data.TaggedError("TraderRepositoryError")<{
  readonly traderId: TraderId
  readonly cause: unknown
  readonly message: string
}> {}

export class InsufficientDataError extends Data.TaggedError("InsufficientDataError")<{
  readonly traderId: TraderId
  readonly reason: string
  readonly actual: number
  readonly required: number
}> {}
