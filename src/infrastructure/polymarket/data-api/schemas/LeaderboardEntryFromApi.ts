import { Schema } from "effect";
import { LeaderboardEntry } from "../../../../domain/leaderboard/LeaderboardEntry";
import { TraderId } from "../../../../domain/trader/TraderId";
import { USDAmount } from "../../../../domain/shared/types";

// API response shape from Polymarket Data API /v1/leaderboard
const LeaderboardEntryApi = Schema.Struct({
  rank: Schema.String,
  proxyWallet: Schema.String,
  userName: Schema.String,
  xUsername: Schema.NullOr(Schema.String),
  verifiedBadge: Schema.Boolean,
  vol: Schema.Number,
  pnl: Schema.Number,
  profileImage: Schema.String,
});

export const LeaderboardEntryFromApi = Schema.transform(
  LeaderboardEntryApi,
  LeaderboardEntry,
  {
    strict: true,
    decode: (api) => ({
      rank: api.rank,
      traderId: api.proxyWallet as TraderId,
      username: api.userName || null,
      volume: api.vol as USDAmount,
      pnl: api.pnl as USDAmount,
      profileImage: api.profileImage || null,
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
      profileImage: domain.profileImage ?? "",
    }),
  }
);

export const LeaderboardApiResponse = Schema.Array(LeaderboardEntryFromApi);
export type LeaderboardApiResponse = typeof LeaderboardApiResponse.Type;
