export type MarketCategory =
  | 'volatility_1s'
  | 'volatility_2s'
  | 'jump'
  | 'daily_reset'
  | 'step'
  | 'crash_boom'
  | 'range_dex'
  | 'forex_major'
  | 'forex_cross'
  | 'metals';

export type TradeDirection = 'CALL' | 'PUT';
export type SignalBias = 'CALL' | 'PUT' | 'NEUTRAL';
export type DurationUnit = 't' | 's' | 'm';

export interface MarketDefinition {
  symbol: string;
  displayName: string;
  category: MarketCategory;
  categoryLabel: string;
  pip: number;
  isSynthetic: boolean;
  defaultDuration: number;
  defaultDurationUnit: DurationUnit;
  exchangeIsOpen?: boolean;
  riseFallSupported?: boolean | null; // null = unchecked yet, checked via contracts_for
  minRiseFallDuration?: string;
  maxRiseFallDuration?: string;
}

export interface TickPoint {
  epoch: number;
  quote: number;
}

export type StrategyMode = 'strict_edge' | 'forex_mean_reversion' | 'dual_ema_rule';

export interface CandlePoint {
  epoch: number;
  close: number;
}

export interface IndicatorSnapshot {
  ema9: number;
  ema10: number;
  ema20: number;
  ema21: number;
  ema50: number;
  ema100: number;
  emaSlopeNormalized: number;
  rsi14: number;
  rsi21: number;
  stochK: number;
  stochD: number;
  stochRsiK: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdExpanding: boolean;
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPercentB: number;
  zScore: number;
  kaufmanER: number; // 0..1 efficiency ratio (trend vs noise)
  adx14: number; // 3-tick micro-bar ADX trend strength
  plusDI: number;
  minusDI: number;
  choppiness14: number; // 0..100 (<45 trending, >58 choppy)
  linRegTStat: number; // OLS linear regression slope t-statistic
  linRegR2: number; // 0..1 linear fit quality
  varianceRatio: number; // Lo-MacKinlay VR(5): >1.08 trend persistence, <0.92 mean-reversion
  spikeShocked: boolean; // True if abnormal jump/spike distorted recent ticks
  rollingWinRate: number | null; // Strictly non-overlapping walk-forward hit rate (%)
  rollingWins: number; // Non-overlapping walk-forward wins
  rollingSamples: number; // Non-overlapping walk-forward setups evaluated
  tickImbalance: number; // -1..+1 up-tick vs down-tick imbalance
  velocityPct: number;
  streakCount: number; // positive = consecutive up ticks, negative = down ticks
  hurstExponent: number; // Multi-scale Variance-Ratio Hurst (0.1..0.9)
  ljungBoxQ: number; // Ljung-Box Q(4) chi2 serial dependence statistic
  ljungBoxPValue: number; // Exact chi2(4) p-value (<0.01 rejects random walk)
  ac1: number; // Lag-1 tick return autocorrelation
  ac2: number; // Lag-2 tick return autocorrelation
  ouTBeta: number; // Ornstein-Uhlenbeck mean-reversion t-statistic
  ouHalfLife: number; // OU implied mean-reversion half-life in ticks
  shannonEntropy: number; // Normalized 2-tick directional transition entropy (0..1)
  isRngMarket: boolean; // True for Deriv synthetic RNG indices (zero-memory ceiling ~50%)
  payoutPct: number; // Contract payout % used for EV calculation (e.g. 95.3)
  breakevenWinRate: number; // Minimum WR % needed to break even after Deriv payout spread
  expectedValuePct: number; // Honest EV % per $1 risked based on empirical WR & payout
  strategyMode: StrategyMode;
  predictiveModel:
    | 'Verified Edge'
    | 'Forex Z-Fade (5m)'
    | 'Dual-EMA Breakout (Unfiltered)'
    | 'RNG Coin-Flip (Hold)'
    | 'Shock Guard';
}

export interface DeepAnalysisResult {
  symbol: string;
  timestamp: number;
  tickCount: number;
  candleCount?: number;
  currentPrice: number;
  signal: SignalBias;
  confidence: number; // Empirical win probability % (0..75, never fabricated 90%+)
  confluenceCount: number; // Statistical checks passed out of 6
  edgeScore: number; // Expected Value ranking score
  regimeLabel: 'Trending' | 'Mean-Reverting' | 'Choppy Noise' | 'Spike Shock' | 'Insufficient Data';
  marketRiskClass: 'synthetic_rng' | 'real_market';
  tradeAllowed: boolean;
  blockReason: string | null;
  indicators: IndicatorSnapshot | null;
  reasons: string[];
  ema9Series: number[];
  ema21Series: number[];
  bbUpperSeries: number[];
  bbLowerSeries: number[];
}

export interface MarketCrawlState {
  market: MarketDefinition;
  ticks: TickPoint[];
  lastPrice: number | null;
  prevPrice: number | null;
  changePct: number;
  analysis: DeepAnalysisResult | null;
  lastUpdated: number;
  subscriptionId: string | null;
  error: string | null;
  payoutPct: number | null;
}

export interface DerivAccountInfo {
  loginid: string;
  email: string;
  fullname: string;
  balance: number;
  currency: string;
  isVirtual: boolean;
  scopes: string[];
}

export interface ActiveContractState {
  contractId: number;
  symbol: string;
  displayName: string;
  direction: TradeDirection;
  buyPrice: number;
  payout: number;
  currency: string;
  entrySpot: number | null;
  currentSpot: number | null;
  profit: number;
  dateStart: number;
  dateExpiry: number;
  status: 'open' | 'won' | 'lost';
  isSold: boolean;
  martingaleStep: number;
  confidence: number;
  longcode: string;
}

export interface TradeRecord {
  id: string;
  contractId: number;
  symbol: string;
  displayName: string;
  direction: TradeDirection;
  stake: number;
  payout: number;
  profit: number;
  entrySpot: number;
  exitSpot: number;
  martingaleStep: number;
  confidence: number;
  regime: string;
  durationLabel: string;
  openedAt: number;
  settledAt: number;
  won: boolean;
}

export interface AgentConfig {
  baseStake: number;
  martingaleMultiplier: number;
  maxMartingaleSteps: number;
  maxStakeCap: number;
  bankrollRiskGuard: boolean;
  maxCycleRiskPct: number;
  enableTakeProfit: boolean;
  takeProfitTarget: number;
  enableStopLoss: boolean;
  stopLossLimit: number;
  minConfidence: number;
  minKaufmanER: number;
  strategyMode: StrategyMode;
  durationMode: 'fastest' | '5t' | '10t' | '15s' | '30s' | '60s';
  marketScope: 'all' | 'synthetics' | 'forex' | 'pinned';
  autoSwitchMarket: boolean;
  crossPairMartingale: boolean;
  skipJumpIndices: boolean;
  lossCooldownSeconds: number;
  demoOnlyLock: boolean;
  cooldownSeconds: number;
}

export interface SettingsLockState {
  hasPin: boolean;
  isLocked: boolean;
}

export type ConnectionPhase =
  | 'disconnected'
  | 'connecting'
  | 'observer' // connected to public Deriv stream without token
  | 'authorizing'
  | 'authorized'
  | 'error';

export interface AgentLogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'switch' | 'analysis' | 'trade' | 'win' | 'loss' | 'warn';
  message: string;
  symbol?: string;
}

export interface ServerAgentSnapshot {
  connectionPhase: ConnectionPhase;
  account: DerivAccountInfo | null;
  authError: string | null;
  appIdMasked: string;
  hasToken: boolean;
  agentsRunning: boolean;
  martingaleStep: number;
  lastLossSymbol: string | null;
  selectedSymbol: string;
  crawledSymbols: string[];
  sessionProfit: number;
  activeContract: ActiveContractState | null;
  trades: TradeRecord[];
  logs: AgentLogEntry[];
  config: AgentConfig;
  lock: SettingsLockState;
  marketStates: Record<string, MarketCrawlState>;
}
