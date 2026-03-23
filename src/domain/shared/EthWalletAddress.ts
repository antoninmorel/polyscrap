import { Schema } from "effect";

/**
 * Ethereum wallet address (0x followed by 40 hex characters)
 */
export const EthWalletAddress = Schema.String.pipe(
  Schema.pattern(/^0x[a-fA-F0-9]{40}$/, {
    message: () => "Must be a valid Ethereum address (0x followed by 40 hex characters)",
  }),
  Schema.brand("EthWalletAddress"),
);

export type EthWalletAddress = typeof EthWalletAddress.Type;
