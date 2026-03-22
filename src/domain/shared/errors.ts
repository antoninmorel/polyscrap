import { Data } from "effect";

export class InvalidDataError extends Data.TaggedError("InvalidDataError")<{
  readonly message: string;
  readonly data?: unknown;
}> {}
