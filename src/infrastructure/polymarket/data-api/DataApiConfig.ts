import { Config, Context, Duration, Layer } from "effect";

export interface DataApiConfigService {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly cacheTtl: Duration.Duration;
}

export class DataApiConfig extends Context.Tag("DataApiConfig")<
  DataApiConfig,
  DataApiConfigService
>() {}

export const DataApiConfigLive = Layer.effect(
  DataApiConfig,
  Config.all({
    baseUrl: Config.string("DATA_API_BASE_URL").pipe(
      Config.withDefault("https://data-api.polymarket.com")
    ),
    timeoutMs: Config.number("DATA_API_TIMEOUT_MS").pipe(
      Config.withDefault(30000)
    ),
    cacheTtl: Config.duration("DATA_API_CACHE_TTL").pipe(
      Config.withDefault(Duration.minutes(5))
    ),
  })
);
