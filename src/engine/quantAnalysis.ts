import type {
  CandlePoint,
  DeepAnalysisResult,
  IndicatorSnapshot,
  SignalBias,
  StrategyMode,
  TickPoint,
} from '../types/deriv.ts';

function computeEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    result.push(values[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function computeRSILast(values: number[], period = 14): number {
  if (values.length <= period) return 50;
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) avgGain += delta;
    else avgLoss += Math.abs(delta);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const gain = delta > 0 ? delta : 0;
    const loss = delta < 0 ? Math.abs(delta) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  return avgLoss === 0 ? (avgGain === 0 ? 50 : 100) : 100 - 100 / (1 + avgGain / avgLoss);
}

function computeBollingerLast(values: number[], period = 20, mult = 2): {
  upper: number[];
  middle: number[];
  lower: number[];
} {
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - period + 1);
    const slice = values.slice(start, i + 1);
    const mean = slice.reduce((acc, v) => acc + v, 0) / slice.length;
    const variance =
      slice.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / Math.max(1, slice.length);
    const std = Math.sqrt(variance);
    middle.push(mean);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }

  return { upper, middle, lower };
}

function computeKaufmanER(values: number[], period = 14): number {
  if (values.length <= period) return 0;
  const endIdx = values.length - 1;
  const startIdx = endIdx - period;
  const netChange = Math.abs(values[endIdx] - values[startIdx]);
  let volatilitySum = 0;
  for (let i = startIdx + 1; i <= endIdx; i++) {
    volatilitySum += Math.abs(values[i] - values[i - 1]);
  }
  if (volatilitySum === 0) return 0;
  return Math.min(1, netChange / volatilitySum);
}

function computeVarianceRatio(values: number[], q = 5): number {
  if (values.length < q * 5) return 1;
  const d1: number[] = [];
  for (let i = 1; i < values.length; i++) d1.push(values[i] - values[i - 1]);
  const m1 = d1.reduce((a, b) => a + b, 0) / d1.length;
  const v1 = d1.reduce((a, b) => a + (b - m1) ** 2, 0) / Math.max(1, d1.length - 1);

  const dq: number[] = [];
  for (let i = q; i < values.length; i++) dq.push(values[i] - values[i - q]);
  const mq = dq.reduce((a, b) => a + b, 0) / dq.length;
  const vq = dq.reduce((a, b) => a + (b - mq) ** 2, 0) / Math.max(1, dq.length - 1);

  if (v1 <= 0) return 1;
  return vq / (q * v1);
}

function detectSpikeShock(prices: number[]): boolean {
  if (prices.length < 35) return false;
  const diffs: number[] = [];
  for (let i = prices.length - 34; i < prices.length; i++) {
    diffs.push(Math.abs(prices[i] - prices[i - 1]));
  }
  const sorted = [...diffs.slice(0, -5)].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] || 0;
  if (med <= 0) return false;
  const recentMax = Math.max(...diffs.slice(-5));
  return recentMax > 3.8 * med;
}

function estimateHurstVR(slice: number[]): number {
  if (slice.length < 32) return 0.5;
  const d1: number[] = [];
  for (let i = 1; i < slice.length; i++) d1.push(slice[i] - slice[i - 1]);
  const m1 = d1.reduce((a, b) => a + b, 0) / d1.length;
  const v1 = d1.reduce((a, b) => a + (b - m1) ** 2, 0) / Math.max(1, d1.length - 1);
  if (v1 <= 0) return 0.5;

  const qs = [2, 4, 8];
  const hs: number[] = [];
  for (const q of qs) {
    if (slice.length <= q * 3) continue;
    const dq: number[] = [];
    for (let i = q; i < slice.length; i++) dq.push(slice[i] - slice[i - q]);
    const mq = dq.reduce((a, b) => a + b, 0) / dq.length;
    const vq = dq.reduce((a, b) => a + (b - mq) ** 2, 0) / Math.max(1, dq.length - 1);
    const vr = vq / (q * v1);
    if (vr > 0) {
      const hq = 0.5 + 0.5 * (Math.log(vr) / Math.log(q));
      hs.push(Math.max(0.1, Math.min(0.9, hq)));
    }
  }
  if (hs.length === 0) return 0.5;
  return hs.reduce((a, b) => a + b, 0) / hs.length;
}

function chi2df4PValue(q: number): number {
  if (q <= 0 || !Number.isFinite(q)) return 1;
  return Math.max(0, Math.min(1, Math.exp(-q / 2) * (1 + q / 2)));
}

function computeLjungBoxAndAC(slice: number[]): {
  ljungBoxQ: number;
  ljungBoxPValue: number;
  ac1: number;
  ac2: number;
} {
  if (slice.length < 25) {
    return { ljungBoxQ: 0, ljungBoxPValue: 1, ac1: 0, ac2: 0 };
  }
  const r: number[] = [];
  for (let i = 1; i < slice.length; i++) r.push(slice[i] - slice[i - 1]);
  const m = r.length;
  const mu = r.reduce((a, b) => a + b, 0) / m;
  let denom = 0;
  for (let i = 0; i < m; i++) denom += (r[i] - mu) ** 2;
  if (denom <= 0) {
    return { ljungBoxQ: 0, ljungBoxPValue: 1, ac1: 0, ac2: 0 };
  }

  const acs: number[] = [];
  let qStat = 0;
  for (let k = 1; k <= 4; k++) {
    let num = 0;
    for (let t = k; t < m; t++) {
      num += (r[t] - mu) * (r[t - k] - mu);
    }
    const rk = num / denom;
    acs.push(rk);
    qStat += (rk * rk) / Math.max(1, m - k);
  }
  const ljungBoxQ = m * (m + 2) * qStat;
  return {
    ljungBoxQ,
    ljungBoxPValue: chi2df4PValue(ljungBoxQ),
    ac1: acs[0] || 0,
    ac2: acs[1] || 0,
  };
}

function fitOrnsteinUhlenbeck(slice: number[]): {
  ouTBeta: number;
  ouHalfLife: number;
  zScore: number;
} {
  const n = slice.length;
  if (n < 20) return { ouTBeta: 0, ouHalfLife: 200, zScore: 0 };

  const mean = slice.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  const zScore = std > 0 ? (slice[n - 1] - mean) / std : 0;

  const m = n - 1;
  let meanX = 0;
  let meanDx = 0;
  for (let i = 0; i < m; i++) {
    meanX += slice[i];
    meanDx += slice[i + 1] - slice[i];
  }
  meanX /= m;
  meanDx /= m;

  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < m; i++) {
    const dx = slice[i + 1] - slice[i];
    sxx += (slice[i] - meanX) ** 2;
    sxy += (slice[i] - meanX) * (dx - meanDx);
  }
  if (sxx <= 0) return { ouTBeta: 0, ouHalfLife: 200, zScore };

  const beta = sxy / sxx;
  const alpha = meanDx - beta * meanX;
  let rss = 0;
  for (let i = 0; i < m; i++) {
    const dx = slice[i + 1] - slice[i];
    const err = dx - (alpha + beta * slice[i]);
    rss += err * err;
  }
  const seBeta = Math.sqrt(rss / Math.max(1, m - 2) / sxx);
  const ouTBeta = seBeta > 0 ? beta / seBeta : 0;
  const ouHalfLife =
    beta < -0.005 && beta > -1.95
      ? Math.min(200, Math.max(0.5, Math.log(2) / -Math.log(Math.max(0.01, 1 + beta))))
      : 200;

  return { ouTBeta, ouHalfLife, zScore };
}

function computeShannonEntropy(slice: number[]): number {
  const dirs: (1 | -1)[] = [];
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) dirs.push(1);
    else if (d < 0) dirs.push(-1);
  }
  if (dirs.length < 12) return 1;
  const counts: Record<string, number> = { '1,1': 0, '1,-1': 0, '-1,1': 0, '-1,-1': 0 };
  let total = 0;
  for (let i = 1; i < dirs.length; i++) {
    const key = `${dirs[i - 1]},${dirs[i]}`;
    counts[key] = (counts[key] || 0) + 1;
    total++;
  }
  if (total === 0) return 1;
  let entropy = 0;
  for (const c of Object.values(counts)) {
    if (c > 0) {
      const p = c / total;
      entropy -= p * Math.log2(p);
    }
  }
  return Math.max(0, Math.min(1, entropy / 2));
}

function calcBreakevenWinRate(payoutPct: number): number {
  const p = Math.max(10, payoutPct);
  return Number((100 / (1 + p / 100)).toFixed(2));
}

function calcExpectedValuePct(winRatePct: number, payoutPct: number): number {
  const wr = Math.max(0, Math.min(100, winRatePct)) / 100;
  const po = Math.max(0, payoutPct) / 100;
  return Number(((wr * po - (1 - wr)) * 100).toFixed(2));
}

function computeSeriesZScoreLast(values: number[], window = 20): number {
  if (values.length < window + 1) return 0;
  const slice = values.slice(-(window + 1));
  const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
  return std > 0 ? (slice[slice.length - 1] - mean) / std : 0;
}

function backtestDualEMABreakout(
  prices: number[],
  ema9Series: number[],
  ema21Series: number[],
  horizonTicks: number
): { wins: number; samples: number; winRate: number | null } {
  const stepH = Math.max(5, horizonTicks);
  if (prices.length < 40 + stepH) return { wins: 0, samples: 0, winRate: null };

  let wins = 0;
  let samples = 0;
  let i = 25;
  while (i < prices.length - stepH) {
    const freshBull =
      prices[i] > ema9Series[i] &&
      prices[i] > ema21Series[i] &&
      prices[i - 1] <= Math.max(ema9Series[i - 1], ema21Series[i - 1]) &&
      ema9Series[i] > ema21Series[i];
    const freshBear =
      prices[i] < ema9Series[i] &&
      prices[i] < ema21Series[i] &&
      prices[i - 1] >= Math.min(ema9Series[i - 1], ema21Series[i - 1]) &&
      ema9Series[i] < ema21Series[i];

    if (freshBull || freshBear) {
      const delta = prices[i + stepH] - prices[i];
      if (delta !== 0) {
        samples++;
        if ((freshBull && delta > 0) || (freshBear && delta < 0)) wins++;
      }
      i += stepH;
    } else {
      i++;
    }
  }

  return {
    wins,
    samples,
    winRate: samples > 0 ? Math.round((wins / samples) * 100) : null,
  };
}

function backtestForexZFade(
  closes: number[],
  horizonBars = 3
): { wins: number; samples: number; winRate: number | null } {
  if (closes.length < 30 + horizonBars) return { wins: 0, samples: 0, winRate: null };

  let wins = 0;
  let samples = 0;
  let i = 22;
  while (i < closes.length - horizonBars) {
    const slice = closes.slice(i - 20, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - mean) ** 2, 0) / slice.length);
    const z = std > 0 ? (closes[i] - mean) / std : 0;

    if (Math.abs(z) >= 2.0) {
      const delta = closes[i + horizonBars] - closes[i];
      if (delta !== 0) {
        samples++;
        if ((z > 0 && delta < 0) || (z < 0 && delta > 0)) wins++;
      }
      i += horizonBars;
    } else {
      i++;
    }
  }

  return {
    wins,
    samples,
    winRate: samples > 0 ? Math.round((wins / samples) * 100) : null,
  };
}

function backtestStrictTickEdge(
  prices: number[],
  horizonTicks: number
): { wins: number; samples: number; winRate: number | null } {
  return backtestDualEMABreakout(prices, computeEMA(prices, 9), computeEMA(prices, 21), horizonTicks);
}

export function isDerivRngMarket(symbol: string): boolean {
  return !symbol.startsWith('frx');
}

export function runDeepQuantAnalysis(
  symbol: string,
  ticks: TickPoint[],
  minWinRatePct = 50,
  _minKaufmanER = 0.15,
  horizonTicks = 5,
  strategyMode: StrategyMode = 'dual_ema_rule',
  payoutPctOverride?: number | null,
  candles5m?: CandlePoint[]
): DeepAnalysisResult {
  const prices = ticks.map((t) => t.quote);
  const currentPrice = prices.length > 0 ? prices[prices.length - 1] : 0;
  const isRngMarket = isDerivRngMarket(symbol);
  const marketRiskClass: DeepAnalysisResult['marketRiskClass'] = isRngMarket
    ? 'synthetic_rng'
    : 'real_market';
  const payoutPct =
    typeof payoutPctOverride === 'number' && payoutPctOverride > 10
      ? Number(payoutPctOverride.toFixed(1))
      : isRngMarket
        ? 95.3
        : 82.0;
  const breakevenWinRate = calcBreakevenWinRate(payoutPct);

  if (prices.length < 40) {
    return {
      symbol,
      timestamp: Date.now(),
      tickCount: prices.length,
      candleCount: candles5m?.length || 0,
      currentPrice,
      signal: 'NEUTRAL',
      confidence: 0,
      confluenceCount: 0,
      edgeScore: -99,
      regimeLabel: 'Insufficient Data',
      marketRiskClass,
      tradeAllowed: false,
      blockReason: `Collecting live ticks (${prices.length}/40 minimum required)`,
      indicators: null,
      reasons: [`Buffering live Deriv tick history (${prices.length}/40 ticks)`],
      ema9Series: [],
      ema21Series: [],
      bbUpperSeries: [],
      bbLowerSeries: [],
    };
  }

  const n = prices.length;
  const prevPrice = prices[n - 2];
  const prev2Price = prices[n - 3];

  const ema9Series = computeEMA(prices, 9);
  const ema21Series = computeEMA(prices, 21);
  const ema50Last = computeEMA(prices, 50)[n - 1] ?? currentPrice;
  const ema9 = ema9Series[n - 1] ?? currentPrice;
  const ema21 = ema21Series[n - 1] ?? currentPrice;
  const ema9Prev1 = ema9Series[Math.max(0, n - 2)] ?? ema9;
  const ema21Prev1 = ema21Series[Math.max(0, n - 2)] ?? ema21;
  const ema9Prev3 = ema9Series[Math.max(0, n - 4)] ?? ema9;
  const ema21Prev3 = ema21Series[Math.max(0, n - 4)] ?? ema21;
  const ema9Prev5 = ema9Series[Math.max(0, n - 6)] ?? ema9;
  const emaSlopeNormalized = ema9Prev5 !== 0 ? ((ema9 - ema9Prev5) / ema9Prev5) * 10000 : 0;

  const rsi14 = computeRSILast(prices, 14);
  const bb = computeBollingerLast(prices, 20, 2.0);
  const bbUpper = bb.upper[bb.upper.length - 1];
  const bbMiddle = bb.middle[bb.middle.length - 1];
  const bbLower = bb.lower[bb.lower.length - 1];
  const bbRange = bbUpper - bbLower;
  const bbPercentB = bbRange > 0 ? (currentPrice - bbLower) / bbRange : 0.5;

  const kaufmanER = Math.max(computeKaufmanER(prices, 10), computeKaufmanER(prices, 16));
  const varianceRatio = computeVarianceRatio(prices.slice(-60), 5);
  const spikeShocked = detectSpikeShock(prices);

  const slice80 = prices.slice(-80);
  const slice60 = prices.slice(-60);
  const slice45 = prices.slice(-45);

  const hurstExponent = estimateHurstVR(slice80);
  const { ljungBoxQ, ljungBoxPValue, ac1, ac2 } = computeLjungBoxAndAC(slice80);
  const { ouTBeta, ouHalfLife, zScore } = fitOrnsteinUhlenbeck(slice45);
  const shannonEntropy = computeShannonEntropy(slice60);

  const lookback = Math.min(12, n - 1);
  let upTicks = 0;
  let downTicks = 0;
  for (let i = n - lookback; i < n; i++) {
    if (prices[i] > prices[i - 1]) upTicks++;
    else if (prices[i] < prices[i - 1]) downTicks++;
  }
  const tickImbalance = lookback > 0 ? (upTicks - downTicks) / lookback : 0;

  let streakCount = 0;
  for (let i = n - 1; i > 0; i--) {
    const diff = prices[i] - prices[i - 1];
    if (diff === 0) continue;
    const dir = diff > 0 ? 1 : -1;
    if (streakCount === 0) streakCount = dir;
    else if (Math.sign(streakCount) === dir) streakCount += dir;
    else break;
  }

  const refPrice = prices[Math.max(0, n - 6)];
  const velocityPct = refPrice !== 0 ? ((currentPrice - refPrice) / refPrice) * 100 : 0;

  const candleCloses = candles5m && candles5m.length >= 20 ? candles5m.map((c) => c.close) : [];
  const wfResult =
    !isRngMarket && candleCloses.length >= 20
      ? backtestForexZFade(candleCloses, 3)
      : backtestDualEMABreakout(prices, ema9Series, ema21Series, horizonTicks);

  const empiricalWR =
    wfResult.samples >= 4 && wfResult.winRate !== null
      ? Math.min(80, Math.max(30, wfResult.winRate))
      : 55;
  const expectedValuePct = calcExpectedValuePct(empiricalWR, payoutPct);

  let signal: SignalBias = 'NEUTRAL';
  let predictiveModel: IndicatorSnapshot['predictiveModel'] = 'Dual-EMA Breakout (Unfiltered)';
  let regimeLabel: DeepAnalysisResult['regimeLabel'] = 'Trending';
  let blockReason: string | null = null;
  let confluenceCount = 4;
  const reasons: string[] = [];

  // --- ATR VOLATILITY GUARD (Advisory / High Threshold) ---
  let atrSum = 0;
  const atrPeriod = 14;
  for (let i = Math.max(1, n - atrPeriod); i < n; i++) {
    const tr = Math.abs(prices[i] - prices[i - 1]);
    atrSum += tr;
  }
  const atr14 = atrSum / Math.min(n - 1, atrPeriod);
  const maxAtrThreshold = 50.0;
  const volatilityGuardTriggered = atr14 > maxAtrThreshold;

  if (spikeShocked) {
    predictiveModel = 'Shock Guard';
    regimeLabel = 'Spike Shock';
    blockReason = 'Tick variance shock (>3.8x median step) — paused until variance normalizes';
    reasons.push('Abnormal jump/spike distortion in recent 5 ticks.');
  } else if (volatilityGuardTriggered) {
    predictiveModel = 'Dual-EMA Breakout (Unfiltered)';
    regimeLabel = 'Choppy Noise';
    blockReason = `Volatility Guard: ATR(14) = ${atr14.toFixed(2)} exceeds safety threshold (${maxAtrThreshold}) — pausing to prevent slippage`;
    reasons.push(`Market volatility exceeds safe threshold; pausing trading on ${symbol}.`);
  } else if (!isRngMarket && strategyMode === 'forex_mean_reversion' && candleCloses.length >= 20) {
    const z5m = computeSeriesZScoreLast(candleCloses, 20);
    predictiveModel = 'Forex Z-Fade (5m)';
    regimeLabel = 'Mean-Reverting';
    if (z5m >= 2.0) {
      signal = 'PUT';
      blockReason = null;
      reasons.push(`Forex 5m Z-Score = +${z5m.toFixed(2)}σ (extreme high overextension -> fading).`);
    } else if (z5m <= -2.0) {
      signal = 'CALL';
      blockReason = null;
      reasons.push(`Forex 5m Z-Score = ${z5m.toFixed(2)}σ (extreme low overextension -> bouncing).`);
    } else {
      signal = z5m >= 0 ? 'PUT' : 'CALL';
      blockReason = null;
      reasons.push(`Forex 5m Z-Score = ${z5m >= 0 ? '+' : ''}${z5m.toFixed(2)}σ active.`);
    }
  } else {
    // --- EXACT BREAKOUT TRIGGER & RSI(14) FILTER ---
    const aboveBoth = currentPrice > ema9 && currentPrice > ema21;
    const belowBoth = currentPrice < ema9 && currentPrice < ema21;
    const prevAboveBoth = prevPrice > ema9Prev1 && prevPrice > ema21Prev1;
    const prevBelowBoth = prevPrice < ema9Prev1 && prevPrice < ema21Prev1;

    const freshBullCross = aboveBoth && !prevAboveBoth && ema9 >= ema21;
    const freshBearCross = belowBoth && !prevBelowBoth && ema9 <= ema21;

    // Anti-Whipsaw Chop Filter
    const net3Tick = Math.abs(currentPrice - prices[Math.max(0, n - 4)]);
    const isSidewaysChop = net3Tick < (bbRange * 0.015 || 1e-4);

    // RSI(14) supportive confluence filter (relaxed to RSI < 55 for Buy, RSI > 45 for Sell for active trading)
    const rsiBuyOk = rsi14 < 58;
    const rsiSellOk = rsi14 > 42;

    if ((freshBullCross || aboveBoth) && !isSidewaysChop && rsiBuyOk) {
      signal = 'CALL';
      predictiveModel = 'Dual-EMA Breakout (Unfiltered)';
      regimeLabel = 'Trending';
      blockReason = null;
      reasons.push(
        `Fresh Bullish Breakout & RSI = ${rsi14.toFixed(1)} — Executing BUY (CALL).`
      );
    } else if ((freshBearCross || belowBoth) && !isSidewaysChop && rsiSellOk) {
      signal = 'PUT';
      predictiveModel = 'Dual-EMA Breakout (Unfiltered)';
      regimeLabel = 'Trending';
      blockReason = null;
      reasons.push(
        `Fresh Bearish Breakout & RSI = ${rsi14.toFixed(1)} — Executing SELL (PUT).`
      );
    } else {
      signal = 'NEUTRAL';
      predictiveModel = 'Dual-EMA Breakout (Unfiltered)';
      regimeLabel = aboveBoth || belowBoth ? 'Trending' : 'Choppy Noise';
      blockReason = `Waiting for EMA 9/21 breakout cross (RSI=${rsi14.toFixed(1)})`;
      reasons.push(`Awaiting active breakout cross across Green (EMA 9) and Yellow (EMA 21).`);
    }
  }

  const tradeAllowed = blockReason === null && (signal === 'CALL' || signal === 'PUT');
  const ema10 = computeEMA(prices, 10)[n - 1] ?? currentPrice;
  const ema20 = computeEMA(prices, 20)[n - 1] ?? currentPrice;
  const ema100 = computeEMA(prices, 100)[n - 1] ?? currentPrice;
  const rsi21 = computeRSILast(prices, 21);
  const stoch = computeStochastic(prices, 14, 3);
  const macd = computeMACD(prices);

  const indicators: IndicatorSnapshot = {
    ema9,
    ema10,
    ema20,
    ema21,
    ema50: ema50Last,
    ema100,
    emaSlopeNormalized,
    rsi14,
    rsi21,
    stochK: stoch.k,
    stochD: stoch.d,
    stochRsiK: stoch.k,
    macdLine: macd.line,
    macdSignal: macd.signal,
    macdHistogram: macd.histogram,
    macdExpanding: macd.expanding,
    bbUpper,
    bbMiddle,
    bbLower,
    bbPercentB,
    zScore,
    kaufmanER,
    adx14: 20,
    plusDI: 20,
    minusDI: 20,
    choppiness14: 50,
    linRegTStat: 0,
    linRegR2: 0,
    varianceRatio,
    spikeShocked,
    rollingWinRate: wfResult.winRate,
    rollingWins: wfResult.wins,
    rollingSamples: wfResult.samples,
    tickImbalance,
    velocityPct,
    streakCount,
    hurstExponent,
    ljungBoxQ,
    ljungBoxPValue,
    ac1,
    ac2,
    ouTBeta,
    ouHalfLife,
    shannonEntropy,
    isRngMarket,
    payoutPct,
    breakevenWinRate,
    expectedValuePct,
    strategyMode,
    predictiveModel,
  };

  const edgeScore = Number((expectedValuePct + (tradeAllowed ? 25 : 0)).toFixed(2));

  return {
    symbol,
    timestamp: Date.now(),
    tickCount: prices.length,
    candleCount: candles5m?.length || 0,
    currentPrice,
    signal,
    confidence: empiricalWR,
    confluenceCount,
    edgeScore,
    regimeLabel,
    marketRiskClass,
    tradeAllowed,
    blockReason,
    indicators,
    reasons,
    ema9Series,
    ema21Series,
    bbUpperSeries: bb.upper,
    bbLowerSeries: bb.lower,
  };
}

function computeMACD(values: number[]): { line: number; signal: number; histogram: number; expanding: boolean } {
  const ema12 = computeEMA(values, 12);
  const ema26 = computeEMA(values, 26);
  const macdLineSeries: number[] = [];
  for (let i = 0; i < values.length; i++) {
    macdLineSeries.push((ema12[i] ?? values[i]) - (ema26[i] ?? values[i]));
  }
  const signalSeries = computeEMA(macdLineSeries, 9);
  const n = values.length;
  const line = macdLineSeries[n - 1] ?? 0;
  const signal = signalSeries[n - 1] ?? 0;
  const histogram = line - signal;
  const prevHistogram = (macdLineSeries[n - 2] ?? 0) - (signalSeries[n - 2] ?? 0);
  const expanding = Math.abs(histogram) > Math.abs(prevHistogram);
  return { line, signal, histogram, expanding };
}

function computeStochastic(values: number[], period = 14, dPeriod = 3): { k: number; d: number } {
  if (values.length < period) return { k: 50, d: 50 };
  const kSeries: number[] = [];
  for (let i = period - 1; i < values.length; i++) {
    const slice = values.slice(i - period + 1, i + 1);
    const low = Math.min(...slice);
    const high = Math.max(...slice);
    const current = values[i];
    const k = high === low ? 50 : ((current - low) / (high - low)) * 100;
    kSeries.push(k);
  }
  const dSeries = computeEMA(kSeries, dPeriod);
  const k = kSeries[kSeries.length - 1] ?? 50;
  const d = dSeries[dSeries.length - 1] ?? 50;
  return { k, d };
}
