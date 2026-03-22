import { Schema } from "effect";

export const TraderId = Schema.String.pipe(Schema.brand("TraderId"));
export type TraderId = typeof TraderId.Type;
