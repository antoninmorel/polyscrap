import { Schema } from "effect";

// API response shape from Polymarket Data API /traded
export const TradedApiResponse = Schema.Struct({
  user: Schema.String,
  traded: Schema.Number,
});

export type TradedApiResponse = typeof TradedApiResponse.Type;
