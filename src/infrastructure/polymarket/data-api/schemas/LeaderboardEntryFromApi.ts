import { Schema } from "effect";
import { LeaderboardEntry } from "../../../../domain/leaderboard/LeaderboardEntry";
import { USDAmount } from "../../../../domain/shared/types";
import { TraderId } from "../../../../domain/trader/TraderId";

// API response shape from Polymarket Data API /v1/leaderboard
const LeaderboardEntryApi = Schema.Struct({
  rank: Schema.String,
  proxyWallet: Schema.String,
  userName: Schema.String,
  xUsername: Schema.NullOr(Schema.String),
  verifiedBadge: Schema.Boolean,
  vol: Schema.Number,
  pnl: Schema.Number,
});

export const LeaderboardEntryFromApi = Schema.transform(LeaderboardEntryApi, LeaderboardEntry, {
  strict: true,
  decode: (api) => ({
    rank: api.rank,
    traderId: TraderId.make(api.proxyWallet),
    username: api.userName || null,
    volume: USDAmount.make(api.vol),
    pnl: USDAmount.make(api.pnl),
    verifiedBadge: api.verifiedBadge,
  }),
  encode: (domain) => ({
    rank: String(domain.rank),
    proxyWallet: domain.traderId,
    userName: domain.username ?? "",
    xUsername: null,
    verifiedBadge: domain.verifiedBadge ?? false,
    vol: domain.volume,
    pnl: domain.pnl,
  }),
});

export const LeaderboardApiResponse = Schema.Array(LeaderboardEntryFromApi);
export type LeaderboardApiResponse = typeof LeaderboardApiResponse.Type;
