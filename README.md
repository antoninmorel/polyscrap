# Polyscrap

## Installation

```bash
bun install
```

## Usage

```bash
bun find-traders
```

## Trader Scoring Algorithm

The scoring system evaluates traders based on 5 weighted factors, producing a composite score from 0-100.

### Default Weights

| Factor          | Weight | Description                        |
| --------------- | ------ | ---------------------------------- |
| ROI             | 30%    | Return on Investment               |
| Win Rate        | 25%    | Percentage of profitable trades    |
| Consistency     | 20%    | Stability of returns               |
| Volume          | 15%    | Total trading volume               |
| Recent Activity | 10%    | How recently the trader was active |

### Metrics Calculation

#### ROI (Return on Investment)

```
ROI = (Total Realized PnL / Total Invested) × 100
```

Measures overall profitability relative to capital deployed.

#### Win Rate

```
Win Rate = (Winning Positions / Total Positions) × 100
```

A position is "winning" if `realizedPnl > 0`.

#### Consistency Score

Measures the stability of per-trade returns using variance:

1. Calculate per-position ROI: `positionROI = realizedPnl / totalBought`
2. Compute standard deviation of all position ROIs
3. Transform to 0-1 scale: `consistency = 1 / (1 + stdDev)`

Higher consistency (closer to 1) means more predictable returns.

#### Volume Score

Uses logarithmic scaling to prevent large traders from dominating:

```
volumeScore = normalize(log(totalVolume + 1))
```

#### Recency Score

Linear decay based on days since last activity:

- Active within 1 day: 100
- Active 30+ days ago: 0
- Between: Linear interpolation

```
recencyScore = max(0, 100 - (daysSinceActive / 30) × 100)
```

### Normalization

ROI, Win Rate, and Volume scores are normalized using min-max normalization across all analyzed traders:

```
normalizedScore = ((value - min) / (max - min)) × 100
```

This ensures scores are relative to the current trader pool.

### Composite Score

The final score is a weighted sum:

```
compositeScore = (roiScore × 0.30) +
                 (winRateScore × 0.25) +
                 (consistencyScore × 0.20) +
                 (volumeScore × 0.15) +
                 (recencyScore × 0.10)
```

### Filtering Criteria

Traders are excluded if they don't meet minimum requirements:

- **Minimum trades**: 10 closed positions
- **Minimum volume**: $100 total invested
