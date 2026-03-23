import { Data } from "effect";
import type { TraderId } from "./TraderId";

export class TraderRepositoryError extends Data.TaggedError("TraderRepositoryError")<{
  readonly traderId: TraderId;
  readonly cause: unknown;
  readonly message: string;
}> {
  static fromCause =
    (traderId: TraderId, message: string) =>
    (cause: unknown): TraderRepositoryError =>
      new TraderRepositoryError({ traderId, cause, message });
}

export class InsufficientDataError extends Data.TaggedError("InsufficientDataError")<{
  readonly traderId: TraderId;
  readonly reason: string;
  readonly actual: number;
  readonly required: number;
}> {}

export class TraderNotFoundError extends Data.TaggedError("TraderNotFoundError")<{
  readonly identifier: string;
  readonly identifierType: "username" | "traderId";
}> {}
