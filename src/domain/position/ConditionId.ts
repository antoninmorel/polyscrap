import { Schema } from "effect"

export const ConditionId = Schema.String.pipe(Schema.brand("ConditionId"))
export type ConditionId = typeof ConditionId.Type
