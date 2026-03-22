import { Percentage, USDAmount } from "../shared/types";
import type { ClosedPosition } from "../position/ClosedPosition";
import type { TraderMetrics } from "./TraderMetrics";

/**
 * Calculate ROI (Return on Investment) from closed positions
 * ROI = Total Realized PnL / Total Invested
 */
export const calculateROI = (positions: ReadonlyArray<ClosedPosition>): Percentage => {
  if (positions.length === 0) {
    return Percentage.make(0);
  }

  const totalInvested = positions.reduce((sum, pos) => sum + pos.totalBought, 0);

  if (totalInvested === 0) {
    return Percentage.make(0);
  }

  const totalPnl = positions.reduce((sum, pos) => sum + pos.realizedPnl, 0);

  const roi = (totalPnl / totalInvested) * 100;
  return Percentage.make(roi);
};

/**
 * Calculate win rate from closed positions
 * Win Rate = Winning Positions / Total Positions
 */
export const calculateWinRate = (positions: ReadonlyArray<ClosedPosition>): Percentage => {
  if (positions.length === 0) {
    return Percentage.make(0);
  }

  const winningPositions = positions.filter((pos) => pos.realizedPnl > 0).length;
  const winRate = (winningPositions / positions.length) * 100;

  return Percentage.make(winRate);
};

/**
 * Calculate consistency score from closed positions
 * Higher consistency = lower variance in per-trade returns
 * Returns a value between 0 and 1 (1 = perfectly consistent)
 */
export const calculateConsistency = (positions: ReadonlyArray<ClosedPosition>): number => {
  if (positions.length < 2) {
    return 1; // Not enough data to measure variance, assume consistent
  }

  // Calculate per-position ROI
  const positionROIs = positions
    .filter((pos) => pos.totalBought > 0)
    .map((pos) => pos.realizedPnl / pos.totalBought);

  if (positionROIs.length < 2) {
    return 1;
  }

  // Calculate mean ROI
  const meanROI = positionROIs.reduce((sum, roi) => sum + roi, 0) / positionROIs.length;

  // Calculate variance
  const variance =
    positionROIs.reduce((sum, roi) => sum + Math.pow(roi - meanROI, 2), 0) / positionROIs.length;

  // Standard deviation
  const stdDev = Math.sqrt(variance);

  // Convert to consistency score (0-1)
  // Using sigmoid-like transformation: 1 / (1 + stdDev)
  // Higher stdDev = lower consistency
  const consistency = 1 / (1 + stdDev);

  return consistency;
};

/**
 * Calculate total volume from closed positions
 */
export const calculateTotalVolume = (positions: ReadonlyArray<ClosedPosition>): USDAmount => {
  const volume = positions.reduce((sum, pos) => sum + pos.totalBought, 0);
  return USDAmount.make(volume);
};

/**
 * Calculate total realized PnL from closed positions
 */
export const calculateTotalRealizedPnl = (positions: ReadonlyArray<ClosedPosition>): USDAmount => {
  const pnl = positions.reduce((sum, pos) => sum + pos.realizedPnl, 0);
  return USDAmount.make(pnl);
};

/**
 * Calculate average trade size from closed positions
 */
export const calculateAvgTradeSize = (positions: ReadonlyArray<ClosedPosition>): USDAmount => {
  if (positions.length === 0) {
    return USDAmount.make(0);
  }

  const totalVolume = positions.reduce((sum, pos) => sum + pos.totalBought, 0);
  return USDAmount.make(totalVolume / positions.length);
};

/**
 * Calculate all trader metrics from closed positions
 */
export const calculateMetrics = (
  positions: ReadonlyArray<ClosedPosition>,
  lastActiveAt: Date,
): TraderMetrics => {
  return {
    roi: calculateROI(positions),
    winRate: calculateWinRate(positions),
    totalTrades: positions.length,
    totalVolume: calculateTotalVolume(positions),
    realizedPnl: calculateTotalRealizedPnl(positions),
    consistency: calculateConsistency(positions),
    avgTradeSize: calculateAvgTradeSize(positions),
    lastActiveAt,
  };
};
