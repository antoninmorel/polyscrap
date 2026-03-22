import { Schema } from "effect";

// =============================================================================
// Branded Types (shared across aggregates)
// =============================================================================

export const Percentage = Schema.Number.pipe(Schema.between(0, 100), Schema.brand("Percentage"));
export type Percentage = typeof Percentage.Type;

export const USDAmount = Schema.Number.pipe(Schema.brand("USDAmount"));
export type USDAmount = typeof USDAmount.Type;
