import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  CURATED_DERIV_MARKETS,
  mergeWithLiveActiveSymbols,
} from './src/data/markets.ts';
import { DerivWSClient, resolveValidDuration } from './src/engine/derivClient.ts';
import { runDeepQuantAnalysis } from './src/engine/quantAnalysis.ts';
import type {
  ActiveContractState,
  AgentConfig,
  AgentLogEntry,
  CandlePoint,
  ConnectionPhase,
  DerivAccountInfo,
  MarketCrawlState,
  MarketDefinition,
  ServerAgentSnapshot,
  TickPoint,
  TradeDirection,
  TradeRecord,
} from './src/types/deriv.ts';

const PORT = 3000;
const STATE_FILE = path.resolve(process.cwd(), '.deriv-agent-state.json');

const DEFAULT_CRAWL_POOL = [
  '1HZ100V',
  '1HZ90V',
  '1HZ75V',
  '1HZ50V',
  '1HZ30V',
  '1HZ25V',
  '1HZ15V',
  '1HZ10V',
  '1HZ150V',
  '1HZ250V',
  'R_100',
  'R_75',
  'R_50',
  'R_25',
  'R_10',
  'JD10',
  'JD25',
  'JD50',
  'JD75',
  'JD100',
  'RDBULL',
  'RDBEAR',
  'stpRNG',
  'stpRNG2',
];

const INITIAL_CONFIG: AgentConfig = {
  baseStake: 1,
  martingaleMultiplier: 2.2,
  maxMartingaleSteps: 4,
  maxStakeCap: 5000,
  bankrollRiskGuard: false,
  maxCycleRiskPct: 5,
  enableTakeProfit: false,
  takeProfitTarget: 2500,
  enableStopLoss: false,
  stopLossLimit: 100,
  minConfidence: 50,
  minKaufmanER: 0.15,
  strategyMode: 'dual_ema_rule',
  durationMode: '5t',
  marketScope: 'all',
  autoSwitchMarket: true,
  crossPairMartingale: true,
  skipJumpIndices: true,
  lossCooldownSeconds: 45,
  demoOnlyLock: true,
  cooldownSeconds: 4,
};

interface PersistedDiskState {
  appId: string;
  apiToken: string;
  config: AgentConfig;
  crawledSymbols: string[];
  selectedSymbol: string;
  agentsRunning: boolean;
  martingaleStep: number;
  lastLossSymbol: string | null;
  sessionProfit: number;
  trades: TradeRecord[];
  pinHash: string | null;
  isLocked: boolean;
  bankrollRiskGuardExplicitlySet?: boolean;
}

function hashPin(pin: string): string {
  return crypto.createHash('sha256').update(`deriv-quant:${pin.trim()}`).digest('hex');
}

function maskAppId(id: string): string {
  const s = id.trim();
  if (!s) return '';
  if (s.length <= 4) return s;
  return `${s.slice(0, 4)}••••${s.slice(-2)}`;
}

function buildInitialMarketStates(markets: MarketDefinition[]): Record<string, MarketCrawlState> {
  const rec: Record<string, MarketCrawlState> = {};
  for (const m of markets) {
    rec[m.symbol] = {
      market: m,
      ticks: [],
      lastPrice: null,
      prevPrice: null,
      changePct: 0,
      analysis: null,
      lastUpdated: 0,
      subscriptionId: null,
      error: null,
      payoutPct: null,
    };
  }
  return rec;
}

class AutonomousAgentRunner {
  private appId = '';
  private apiToken = '';
  private config: AgentConfig = { ...INITIAL_CONFIG };
  private crawledSymbols: string[] = [...DEFAULT_CRAWL_POOL];
  private selectedSymbol = '1HZ100V';
  private agentsRunning = false;
  private martingaleStep = 0;
  private lastLossSymbol: string | null = null;
  private sessionProfit = 0;
  private trades: TradeRecord[] = [];
  private logs: AgentLogEntry[] = [];
  private pinHash: string | null = null;
  private isLocked = false;
  private bankrollRiskGuardExplicitlySet = false;

  private connectionPhase: ConnectionPhase = 'connecting';
  private account: DerivAccountInfo | null = null;
  private authError: string | null = null;
  private activeContract: ActiveContractState | null = null;
  private marketStates: Record<string, MarketCrawlState> = buildInitialMarketStates(CURATED_DERIV_MARKETS);

  private client: DerivWSClient | null = null;
  private candles5mMap = new Map<string, CandlePoint[]>();
  private candlesLastFetched = new Map<string, number>();
  private symbolCooldownUntil: Record<string, number> = {};
  private lastTradeSettledAt = 0;
  private isPlacingTrade = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private sseClients = new Set<express.Response>();
  private broadcastDirty = false;
  private intentionalDisconnect = false;

  constructor() {
    this.loadFromDisk();
    this.startLoop();
    this.startBroadcastLoop();
    void this.connectDeriv();
  }

  private loadFromDisk(): void {
    try {
      if (!fs.existsSync(STATE_FILE)) return;
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<PersistedDiskState>;
      if (typeof parsed.appId === 'string') this.appId = parsed.appId;
      if (typeof parsed.apiToken === 'string') this.apiToken = parsed.apiToken;
      if (parsed.config) {
        const mergedCfg = { ...INITIAL_CONFIG, ...parsed.config };
        // Upgrade untouched legacy fake-confidence thresholds (68 / 76) to empirical win-rate scale (54%)
        if (parsed.config.strategyMode === undefined) {
          mergedCfg.strategyMode = 'strict_edge';
          if (mergedCfg.minConfidence >= 68) {
            mergedCfg.minConfidence = INITIAL_CONFIG.minConfidence;
          }
        }
        if (parsed.config.bankrollRiskGuard === undefined && mergedCfg.durationMode === 'fastest') {
          mergedCfg.durationMode = '5t';
        }
        // Only keep bankrollRiskGuard active if the operator explicitly toggled it on
        if (!parsed.bankrollRiskGuardExplicitlySet) {
          mergedCfg.bankrollRiskGuard = false;
        }
        this.config = mergedCfg;
      }
      this.bankrollRiskGuardExplicitlySet = Boolean(parsed.bankrollRiskGuardExplicitlySet);
      if (Array.isArray(parsed.crawledSymbols) && parsed.crawledSymbols.length > 0) {
        this.crawledSymbols = Array.from(
          new Set([...parsed.crawledSymbols.filter((s) => s !== 'RB100' && s !== 'RB200'), 'stpRNG', 'stpRNG2'])
        );
      }
      if (typeof parsed.selectedSymbol === 'string') this.selectedSymbol = parsed.selectedSymbol;
      if (typeof parsed.agentsRunning === 'boolean') this.agentsRunning = parsed.agentsRunning;
      if (typeof parsed.martingaleStep === 'number') this.martingaleStep = parsed.martingaleStep;
      if (parsed.lastLossSymbol !== undefined) this.lastLossSymbol = parsed.lastLossSymbol;
      if (typeof parsed.sessionProfit === 'number') this.sessionProfit = parsed.sessionProfit;
      if (Array.isArray(parsed.trades)) this.trades = parsed.trades.slice(0, 500);
      if (typeof parsed.pinHash === 'string' || parsed.pinHash === null) {
        this.pinHash = parsed.pinHash ?? null;
      }
      if (typeof parsed.isLocked === 'boolean') this.isLocked = parsed.isLocked;
      this.pushLog('info', 'Restored persisted agent configuration and trade ledger');
    } catch {
      // Ignore corrupt disk state
    }
  }

  private saveToDisk(): void {
    try {
      const data: PersistedDiskState = {
        appId: this.appId,
        apiToken: this.apiToken,
        config: this.config,
        crawledSymbols: this.crawledSymbols,
        selectedSymbol: this.selectedSymbol,
        agentsRunning: this.agentsRunning,
        martingaleStep: this.martingaleStep,
        lastLossSymbol: this.lastLossSymbol,
        sessionProfit: this.sessionProfit,
        trades: this.trades.slice(0, 500),
        pinHash: this.pinHash,
        isLocked: this.isLocked,
        bankrollRiskGuardExplicitlySet: this.bankrollRiskGuardExplicitlySet,
      };
      fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // Ignore write error
    }
  }

  private pushLog(type: AgentLogEntry['type'], message: string, symbol?: string): void {
    this.logs = [
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        type,
        message,
        symbol,
      },
      ...this.logs.slice(0, 99),
    ];
    this.broadcastDirty = true;
  }

  public addSseClient(res: express.Response): void {
    this.sseClients.add(res);
    res.write(`data: ${JSON.stringify(this.getSnapshot())}\n\n`);
  }

  public removeSseClient(res: express.Response): void {
    this.sseClients.delete(res);
  }

  private broadcastNow(): void {
    if (this.sseClients.size === 0) return;
    const payload = `data: ${JSON.stringify(this.getSnapshot())}\n\n`;
    for (const res of this.sseClients) {
      try {
        res.write(payload);
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  private startBroadcastLoop(): void {
    setInterval(() => {
      if (this.broadcastDirty) {
        this.broadcastDirty = false;
        this.broadcastNow();
      }
    }, 350);
  }

  public getSnapshot(): ServerAgentSnapshot {
    // Trim tick arrays to 90 points per symbol for snappy mobile SSE payloads
    const trimmedStates: Record<string, MarketCrawlState> = {};
    for (const [sym, st] of Object.entries(this.marketStates)) {
      const isFocused = sym === this.selectedSymbol;
      trimmedStates[sym] = {
        ...st,
        ticks: isFocused ? st.ticks.slice(-90) : st.ticks.slice(-24),
        analysis: st.analysis
          ? isFocused
            ? {
                ...st.analysis,
                ema9Series: st.analysis.ema9Series.slice(-90),
                ema21Series: st.analysis.ema21Series.slice(-90),
                bbUpperSeries: st.analysis.bbUpperSeries.slice(-90),
                bbLowerSeries: st.analysis.bbLowerSeries.slice(-90),
              }
            : {
                ...st.analysis,
                ema9Series: [],
                ema21Series: [],
                bbUpperSeries: [],
                bbLowerSeries: [],
              }
          : null,
      };
    }

    return {
      connectionPhase: this.connectionPhase,
      account: this.account,
      authError: this.authError,
      appIdMasked: maskAppId(this.appId),
      hasToken: Boolean(this.apiToken),
      agentsRunning: this.agentsRunning,
      martingaleStep: this.martingaleStep,
      lastLossSymbol: this.lastLossSymbol,
      selectedSymbol: this.selectedSymbol,
      crawledSymbols: this.crawledSymbols,
      sessionProfit: this.sessionProfit,
      activeContract: this.activeContract,
      trades: this.trades,
      logs: this.logs,
      config: this.config,
      lock: {
        hasPin: Boolean(this.pinHash),
        isLocked: this.isLocked,
      },
      marketStates: trimmedStates,
    };
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || this.reconnectTimer) return;
    const delayMs = Math.min(15000, 2500 * Math.pow(1.4, this.reconnectAttempt));
    this.reconnectAttempt++;
    this.pushLog('warn', `Deriv stream dropped — auto-reconnecting in ${(delayMs / 1000).toFixed(1)}s`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connectDeriv();
    }, delayMs);
  }

  private getEvaluationHorizonTicks(): number {
    return this.config.durationMode === '10t' ? 10 : 5;
  }

  private async subscribeAndVerifySymbol(symbol: string, currency = 'USD'): Promise<void> {
    if (!this.client || !this.client.isConnected()) return;
    try {
      const existing = this.marketStates[symbol];
      if (!existing) return;

      const [history, rf, candles] = await Promise.all([
        this.client.subscribeTicksHistory(symbol, 1000),
        this.client.fetchRiseFallSupport(symbol, currency),
        !existing.market.isSynthetic
          ? this.client.fetchCandlesHistory(symbol, 300, 500)
          : Promise.resolve<CandlePoint[]>([]),
      ]);

      if (!existing.market.isSynthetic && candles.length > 0) {
        this.candles5mMap.set(symbol, candles);
        this.candlesLastFetched.set(symbol, Date.now());
      }

      let payoutPct = existing.payoutPct;
      if (rf.supported) {
        try {
          const durSpec = resolveValidDuration(
            this.config.durationMode,
            rf.minDuration,
            symbol
          );
          const prop = await this.client.getProposalQuote({
            symbol,
            direction: 'CALL',
            amount: 1,
            basis: 'stake',
            currency,
            duration: durSpec.value,
            durationUnit: durSpec.unit,
          });
          if (prop.payoutPct > 0) payoutPct = Number(prop.payoutPct.toFixed(1));
        } catch {
          // Non-fatal if market is closed or proposal throttled
        }
      }

      const updatedMarket: MarketDefinition = {
        ...existing.market,
        riseFallSupported: rf.supported,
        minRiseFallDuration: rf.minDuration,
        maxRiseFallDuration: rf.maxDuration,
      };
      const lastPrice = history.length > 0 ? history[history.length - 1].quote : existing.lastPrice;
      const prevPrice = history.length > 1 ? history[history.length - 2].quote : lastPrice;
      const analysis = runDeepQuantAnalysis(
        symbol,
        history,
        this.config.minConfidence,
        this.config.minKaufmanER,
        this.getEvaluationHorizonTicks(),
        this.config.strategyMode,
        payoutPct,
        this.candles5mMap.get(symbol)
      );

      this.marketStates[symbol] = {
        ...existing,
        market: updatedMarket,
        ticks: history,
        lastPrice,
        prevPrice,
        payoutPct,
        analysis,
        lastUpdated: Date.now(),
        error: null,
      };
      this.broadcastDirty = true;
    } catch (err: any) {
      if (this.marketStates[symbol]) {
        this.marketStates[symbol].error = err?.message || 'Subscription failed';
      }
    }
  }

  public async connectDeriv(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.intentionalDisconnect = true;
    this.client?.disconnect();
    this.intentionalDisconnect = false;

    this.authError = null;
    const hasCreds = Boolean(this.appId.trim() && this.apiToken.trim());
    this.connectionPhase = hasCreds ? 'authorizing' : 'connecting';
    this.broadcastNow();

    const client = new DerivWSClient({
      onClose: () => {
        this.connectionPhase = 'disconnected';
        // IMPORTANT: Keep agentsRunning intact so background auto-reconnect resumes trading automatically!
        this.broadcastDirty = true;
        this.scheduleReconnect();
      },
      onError: (msg) => {
        this.authError = msg;
        this.broadcastDirty = true;
      },
      onTick: (symbol: string, tick: TickPoint) => {
        const existing = this.marketStates[symbol];
        if (!existing) return;
        const last = existing.ticks[existing.ticks.length - 1];
        const nextTicks =
          last && last.epoch === tick.epoch && last.quote === tick.quote
            ? existing.ticks
            : [...existing.ticks.slice(-999), tick];

        if (!existing.market.isSynthetic && this.client?.isConnected()) {
          const lastC = this.candlesLastFetched.get(symbol) || 0;
          if (Date.now() - lastC > 60_000) {
            this.candlesLastFetched.set(symbol, Date.now());
            void this.client.fetchCandlesHistory(symbol, 300, 500).then((c) => {
              if (c.length > 0) this.candles5mMap.set(symbol, c);
            });
          }
        }

        const prevPrice = existing.lastPrice ?? tick.quote;
        const changePct = prevPrice !== 0 ? ((tick.quote - prevPrice) / prevPrice) * 100 : 0;
        const analysis = runDeepQuantAnalysis(
          symbol,
          nextTicks,
          this.config.minConfidence,
          this.config.minKaufmanER,
          this.getEvaluationHorizonTicks(),
          this.config.strategyMode,
          existing.payoutPct,
          this.candles5mMap.get(symbol)
        );

        this.marketStates[symbol] = {
          ...existing,
          ticks: nextTicks,
          prevPrice,
          lastPrice: tick.quote,
          changePct,
          analysis,
          lastUpdated: Date.now(),
        };
        this.broadcastDirty = true;
      },
      onBalance: (balance, currency) => {
        if (this.account) {
          this.account = { ...this.account, balance, currency };
          this.broadcastDirty = true;
        }
      },
      onOpenContractUpdate: (update) => {
        const current = this.activeContract;
        if (!current || current.contractId !== update.contractId) return;

        const updated: ActiveContractState = {
          ...current,
          entrySpot: update.entrySpot ?? current.entrySpot,
          currentSpot: update.currentSpot ?? current.currentSpot,
          profit: update.profit ?? current.profit,
          payout: update.payout ?? current.payout,
          status: update.status ?? current.status,
          isSold: update.isSold ?? current.isSold,
        };

        if (updated.isSold && !current.isSold) {
          this.activeContract = null;
          this.lastTradeSettledAt = Date.now();
          const realized = updated.profit;
          const won = realized >= 0;
          this.sessionProfit = Number((this.sessionProfit + realized).toFixed(2));

          const st = this.marketStates[updated.symbol];
          const record: TradeRecord = {
            id: `${updated.contractId}-${Date.now()}`,
            contractId: updated.contractId,
            symbol: updated.symbol,
            displayName: updated.displayName,
            direction: updated.direction,
            stake: updated.buyPrice,
            payout: updated.payout,
            profit: realized,
            entrySpot: updated.entrySpot ?? 0,
            exitSpot: updated.currentSpot ?? 0,
            martingaleStep: updated.martingaleStep,
            confidence: updated.confidence,
            regime: st?.analysis?.regimeLabel || 'Trending',
            durationLabel: resolveValidDuration(
              this.config.durationMode,
              st?.market.minRiseFallDuration,
              updated.symbol
            ).label,
            openedAt: updated.dateStart * 1000,
            settledAt: Date.now(),
            won,
          };
          this.trades = [record, ...this.trades.slice(0, 499)];

          if (won) {
            this.martingaleStep = 0;
            this.lastLossSymbol = null;
            this.pushLog(
              'win',
              `WIN +${realized.toFixed(2)} ${updated.currency} on ${updated.symbol} (#${updated.contractId}) — Martingale reset to Step 0`,
              updated.symbol
            );
          } else {
            this.lastLossSymbol = updated.symbol;
            if (this.config.lossCooldownSeconds > 0) {
              this.symbolCooldownUntil[updated.symbol] =
                Date.now() + this.config.lossCooldownSeconds * 1000;
            }
            if (this.martingaleStep < this.config.maxMartingaleSteps) {
              this.martingaleStep += 1;
              const nextCalc = this.getEffectiveStakeForStep(this.martingaleStep);
              this.pushLog(
                'loss',
                `LOSS ${realized.toFixed(2)} ${updated.currency} on ${updated.symbol} — Skipping ${updated.symbol}; Martingale Step ${this.martingaleStep} (${nextCalc.stake.toFixed(2)} ${updated.currency}) targeting different signal`,
                updated.symbol
              );
            } else {
              this.martingaleStep = 0;
              this.lastTradeSettledAt = Date.now() + 120_000;
              this.pushLog(
                'warn',
                `LOSS ${realized.toFixed(2)} ${updated.currency} at Max Step ${this.config.maxMartingaleSteps} on ${updated.symbol} — Circuit breaker: resting 120s and resetting to Step 0`,
                updated.symbol
              );
            }
          }

          this.saveToDisk();
          this.broadcastNow();
        } else {
          this.activeContract = updated;
          this.broadcastDirty = true;
        }
      },
    });

    this.client = client;

    try {
      if (hasCreds) {
        const acct = await client.connectAndAuthorize(this.appId, this.apiToken);
        this.account = acct;
        this.connectionPhase = 'authorized';
        this.reconnectAttempt = 0;
        this.pushLog(
          'info',
          `Authorized ${acct.loginid} (${acct.isVirtual ? 'DEMO' : 'REAL'} · ${acct.balance.toFixed(2)} ${acct.currency})`
        );
      } else {
        await client.connectPublic();
        this.account = null;
        this.connectionPhase = 'observer';
        this.reconnectAttempt = 0;
        this.pushLog(
          'info',
          'Connected to Deriv Options Public WebSocket (enter App ID & Token to trade)'
        );
      }

      const liveSymbols = await client.fetchActiveSymbols();
      const merged = mergeWithLiveActiveSymbols(liveSymbols);
      const mergedMap = new Map(merged.map((m) => [m.symbol, m]));

      const nextStates = buildInitialMarketStates(merged);
      for (const key of Object.keys(nextStates)) {
        if (this.marketStates[key]?.ticks.length) {
          nextStates[key].ticks = this.marketStates[key].ticks;
          nextStates[key].lastPrice = this.marketStates[key].lastPrice;
          nextStates[key].prevPrice = this.marketStates[key].prevPrice;
          nextStates[key].analysis = this.marketStates[key].analysis;
        }
      }
      this.marketStates = nextStates;

      const forexCandidates = ['frxEURUSD', 'frxGBPUSD', 'frxUSDJPY', 'frxXAUUSD'].filter(
        (sym) => mergedMap.get(sym)?.exchangeIsOpen !== false
      );
      const basePool = Array.from(new Set([...this.crawledSymbols, ...forexCandidates])).filter(
        (sym) => {
          const m = mergedMap.get(sym);
          return !m || m.exchangeIsOpen !== false;
        }
      );
      this.crawledSymbols = basePool.length > 0 ? basePool : [...DEFAULT_CRAWL_POOL];
      this.saveToDisk();

      const currency = this.account?.currency || 'USD';
      for (let i = 0; i < this.crawledSymbols.length; i += 4) {
        const batch = this.crawledSymbols.slice(i, i + 4);
        await Promise.all(batch.map((sym) => this.subscribeAndVerifySymbol(sym, currency)));
      }
      this.broadcastNow();
    } catch (err: any) {
      this.connectionPhase = 'error';
      const msg = err?.message || 'Failed to connect or authorize with Deriv';
      this.authError = msg;
      this.pushLog('warn', `Deriv connection error: ${msg}`);
      this.broadcastNow();
      this.scheduleReconnect();
    }
  }

  private async placeTrade(
    symbol: string,
    direction: TradeDirection,
    confidence: number
  ): Promise<ActiveContractState | null> {
    if (!this.client || !this.client.isConnected() || !this.account) return null;
    const st = this.marketStates[symbol];
    if (!st || this.isPlacingTrade || this.activeContract) return null;

    if (this.config.demoOnlyLock && !this.account.isVirtual) {
      this.agentsRunning = false;
      this.saveToDisk();
      this.pushLog('warn', 'Trade blocked: Demo Account Safety Lock is active for a Real account');
      return null;
    }

    if (st.market.riseFallSupported === false) {
      this.pushLog('warn', `${st.market.displayName} does not support Rise/Fall contracts`);
      return null;
    }

    if (this.account.balance < 0.35) {
      this.agentsRunning = false;
      this.saveToDisk();
      this.pushLog(
        'warn',
        `Agents paused: Account balance (${this.account.balance.toFixed(2)} ${this.account.currency}) is below Deriv 0.35 minimum stake`
      );
      this.broadcastNow();
      return null;
    }

    const { stake, effectiveBase, clampedByRiskGuard } = this.getEffectiveStakeForStep(
      this.martingaleStep
    );
    const durationSpec = resolveValidDuration(
      this.config.durationMode,
      st.market.minRiseFallDuration,
      st.market.symbol
    );

    this.isPlacingTrade = true;
    try {
      if (clampedByRiskGuard && this.martingaleStep === 0) {
        this.pushLog(
          'info',
          `Bankroll Risk Guard capped Base Stake from ${this.config.baseStake.toFixed(2)} → ${effectiveBase.toFixed(2)} ${this.account.currency} (max ${this.config.maxCycleRiskPct}% cycle risk)`
        );
      }
      this.pushLog(
        'trade',
        `Executing ${direction === 'CALL' ? 'RISE' : 'FALL'} on ${st.market.symbol} · ${stake.toFixed(2)} ${this.account.currency} (Step ${this.martingaleStep}) · ${durationSpec.label} · EstWR ${confidence}%`,
        st.market.symbol
      );
      const result = await this.client.executeRiseFallTrade({
        symbol: st.market.symbol,
        displayName: st.market.displayName,
        direction,
        amount: stake,
        currency: this.account.currency,
        duration: durationSpec.value,
        durationUnit: durationSpec.unit,
        martingaleStep: this.martingaleStep,
        confidence,
        accountBalance: this.account.balance,
      });

      if (result.adjustedFrom && result.buyPrice < result.adjustedFrom) {
        this.pushLog(
          'info',
          `Auto-sized high Martingale stake on ${st.market.symbol}: ${result.adjustedFrom.toFixed(2)} → ${result.buyPrice.toFixed(2)} ${this.account.currency} (${result.adjustmentReason || 'Deriv limit'})`,
          st.market.symbol
        );
      }

      const { adjustedFrom: _af, adjustmentReason: _ar, ...contract } = result;
      this.activeContract = contract;
      this.broadcastNow();
      return contract;
    } catch (err: any) {
      this.lastTradeSettledAt = Date.now();
      this.symbolCooldownUntil[symbol] = Date.now() + 10000;
      this.pushLog(
        'warn',
        `Order rejected by Deriv (${symbol}): ${err?.message || 'Unknown error'}`,
        symbol
      );
      return null;
    } finally {
      this.isPlacingTrade = false;
    }
  }

  private startLoop(): void {
    setInterval(() => {
      if (!this.agentsRunning) return;
      if (!this.account || this.connectionPhase !== 'authorized') return;
      if (!this.client || !this.client.isConnected()) return;

      if (this.config.demoOnlyLock && !this.account.isVirtual) {
        this.agentsRunning = false;
        this.saveToDisk();
        this.pushLog('warn', 'Agents stopped: Demo Safety Lock active on Real account');
        this.broadcastNow();
        return;
      }

      if (this.config.enableTakeProfit && this.sessionProfit >= this.config.takeProfitTarget) {
        this.agentsRunning = false;
        this.saveToDisk();
        this.pushLog(
          'win',
          `Session Take-Profit reached (+${this.sessionProfit.toFixed(2)} ${this.account.currency}) — Agents paused`
        );
        this.broadcastNow();
        return;
      }

      if (this.config.enableStopLoss && this.sessionProfit <= -this.config.stopLossLimit) {
        this.agentsRunning = false;
        this.saveToDisk();
        this.pushLog(
          'warn',
          `Session Stop-Loss reached (${this.sessionProfit.toFixed(2)} ${this.account.currency}) — Agents stopped`
        );
        this.broadcastNow();
        return;
      }

      if (this.activeContract || this.isPlacingTrade) return;
      if (Date.now() - this.lastTradeSettledAt < this.config.cooldownSeconds * 1000) return;

      const now = Date.now();
      const isCrossRecovery =
        this.martingaleStep > 0 &&
        this.config.crossPairMartingale &&
        Boolean(this.lastLossSymbol);

      const candidates = this.crawledSymbols
        .map((sym) => this.marketStates[sym])
        .filter((st): st is MarketCrawlState => {
          if (!st || !st.analysis || !st.analysis.tradeAllowed) return false;
          if (st.market.riseFallSupported === false) return false;
          if (this.config.skipJumpIndices && st.market.category === 'jump') return false;
          if (this.config.marketScope === 'synthetics' && !st.market.isSynthetic) return false;
          if (this.config.marketScope === 'forex' && st.market.isSynthetic) return false;
          if (
            this.config.marketScope === 'pinned' &&
            !isCrossRecovery &&
            st.market.symbol !== this.selectedSymbol
          ) {
            return false;
          }
          if (isCrossRecovery && st.market.symbol === this.lastLossSymbol) return false;
          if ((this.symbolCooldownUntil[st.market.symbol] || 0) > now) return false;
          return true;
        });

      if (candidates.length === 0) return;

      candidates.sort((a, b) => {
        const edgeDiff = (b.analysis?.edgeScore || 0) - (a.analysis?.edgeScore || 0);
        if (Math.abs(edgeDiff) > 0.5) return edgeDiff;
        const diff = (b.analysis?.confidence || 0) - (a.analysis?.confidence || 0);
        if (diff !== 0) return diff;
        return (b.analysis?.confluenceCount || 0) - (a.analysis?.confluenceCount || 0);
      });

      const best = candidates[0];
      if (!this.config.autoSwitchMarket && !isCrossRecovery && best.market.symbol !== this.selectedSymbol) {
        const pinned = candidates.find((c) => c.market.symbol === this.selectedSymbol);
        if (!pinned || !pinned.analysis) return;
        void this.placeTrade(
          pinned.market.symbol,
          pinned.analysis.signal as TradeDirection,
          pinned.analysis.confidence
        );
        return;
      }

      if (best.market.symbol !== this.selectedSymbol) {
        const prev = this.selectedSymbol;
        this.selectedSymbol = best.market.symbol;
        const ind = best.analysis?.indicators;
        const modelTag = ind
          ? `${ind.predictiveModel} · EstWR ${best.analysis!.confidence}% · EV ${ind.expectedValuePct >= 0 ? '+' : ''}${ind.expectedValuePct.toFixed(1)}%`
          : '';
        const wfNote =
          ind && ind.rollingSamples > 0
            ? ` · WF ${ind.rollingWins}/${ind.rollingSamples}`
            : '';
        this.pushLog(
          'switch',
          isCrossRecovery
            ? `Cross-Pair Martingale Step ${this.martingaleStep}: Switched from ${this.lastLossSymbol} (loss) -> ${best.market.symbol} (${best.analysis!.signal === 'CALL' ? 'RISE' : 'FALL'} · ${modelTag}${wfNote})`
            : `Auto-switched ${prev} -> ${best.market.symbol} (${best.analysis!.signal === 'CALL' ? 'RISE' : 'FALL'} · ${modelTag}${wfNote})`,
          best.market.symbol
        );
      }

      if (best.analysis && (best.analysis.signal === 'CALL' || best.analysis.signal === 'PUT')) {
        void this.placeTrade(
          best.market.symbol,
          best.analysis.signal,
          best.analysis.confidence
        );
      }
    }, 850);
  }

  private getEffectiveStakeForStep(step: number): {
    stake: number;
    effectiveBase: number;
    clampedByRiskGuard: boolean;
  } {
    let effectiveBase = Math.max(0.35, this.config.baseStake);
    let clampedByRiskGuard = false;
    const bal = this.account?.balance ?? 0;

    if (this.config.bankrollRiskGuard && bal >= 0.35) {
      let chainFactor = 0;
      for (let s = 0; s <= this.config.maxMartingaleSteps; s++) {
        chainFactor += Math.pow(this.config.martingaleMultiplier, s);
      }
      const maxCycleBudget = bal * (Math.max(1, Math.min(25, this.config.maxCycleRiskPct)) / 100);
      const safeBase = Math.max(
        0.35,
        Math.floor((maxCycleBudget / Math.max(1, chainFactor)) * 100) / 100
      );
      if (effectiveBase > safeBase) {
        effectiveBase = safeBase;
        clampedByRiskGuard = true;
      }
    }

    const raw = effectiveBase * Math.pow(this.config.martingaleMultiplier, step);
    const effectiveCap = Math.max(effectiveBase, this.config.maxStakeCap);
    const stake =
      step === 0
        ? Number(Math.max(0.35, effectiveBase).toFixed(2))
        : Number(Math.min(effectiveCap, Math.max(0.35, raw)).toFixed(2));
    return { stake, effectiveBase, clampedByRiskGuard };
  }

  // Mutation APIs
  public assertUnlocked(): void {
    if (this.isLocked) {
      throw new Error('Settings are locked. Unlock with your Operator PIN first.');
    }
  }

  public async setCredentials(appId: string, apiToken: string): Promise<void> {
    this.assertUnlocked();
    this.appId = appId.trim();
    this.apiToken = apiToken.trim();
    this.agentsRunning = false;
    this.saveToDisk();
    await this.connectDeriv();
  }

  public async clearAuth(): Promise<void> {
    this.assertUnlocked();
    this.apiToken = '';
    this.account = null;
    this.agentsRunning = false;
    this.saveToDisk();
    await this.connectDeriv();
  }

  public updateConfig(next: Partial<AgentConfig>): void {
    this.assertUnlocked();
    if (next.bankrollRiskGuard !== undefined) {
      this.bankrollRiskGuardExplicitlySet = true;
    }
    const merged: AgentConfig = { ...this.config, ...next };
    if (
      next.baseStake !== undefined &&
      next.maxStakeCap === undefined &&
      merged.baseStake > merged.maxStakeCap
    ) {
      merged.maxStakeCap = merged.baseStake;
    }
    this.config = merged;
    // Re-evaluate existing tick buffers immediately with new thresholds
    for (const sym of Object.keys(this.marketStates)) {
      const st = this.marketStates[sym];
      if (st.ticks.length > 0) {
        st.analysis = runDeepQuantAnalysis(
          sym,
          st.ticks,
          this.config.minConfidence,
          this.config.minKaufmanER,
          this.getEvaluationHorizonTicks(),
          this.config.strategyMode,
          st.payoutPct,
          this.candles5mMap.get(sym)
        );
      }
    }
    this.saveToDisk();
    this.broadcastNow();
  }

  public setAgentsRunning(running: boolean): void {
    if (running) {
      if (!this.account || this.connectionPhase !== 'authorized') {
        throw new Error('Authorize your Deriv account before starting agents.');
      }
      if (this.config.demoOnlyLock && !this.account.isVirtual) {
        throw new Error('Demo Safety Lock is active; disable it or use a Demo account.');
      }
      this.agentsRunning = true;
      this.pushLog(
        'info',
        `Background crawling agents started across ${this.crawledSymbols.length} live streams (${this.config.autoSwitchMarket ? 'Auto-Switch ON' : 'Pinned Market'})`
      );
    } else {
      this.agentsRunning = false;
      this.pushLog('info', 'Crawling agents paused by operator');
    }
    this.saveToDisk();
    this.broadcastNow();
  }

  public selectSymbol(symbol: string): void {
    this.selectedSymbol = symbol;
    if (!this.crawledSymbols.includes(symbol)) {
      this.crawledSymbols = [symbol, ...this.crawledSymbols.slice(0, 21)];
      void this.subscribeAndVerifySymbol(symbol, this.account?.currency || 'USD');
    }
    this.saveToDisk();
    this.broadcastNow();
  }

  public toggleCrawlSymbol(symbol: string): void {
    this.assertUnlocked();
    if (this.crawledSymbols.includes(symbol)) {
      if (this.crawledSymbols.length <= 1) return;
      this.crawledSymbols = this.crawledSymbols.filter((s) => s !== symbol);
    } else {
      this.crawledSymbols = [symbol, ...this.crawledSymbols.slice(0, 23)];
      void this.subscribeAndVerifySymbol(symbol, this.account?.currency || 'USD');
    }
    this.saveToDisk();
    this.broadcastNow();
  }

  public resetMartingale(): void {
    this.assertUnlocked();
    this.martingaleStep = 0;
    this.lastLossSymbol = null;
    this.symbolCooldownUntil = {};
    this.pushLog('info', 'Martingale step and losing-pair lock manually reset to Step 0');
    this.saveToDisk();
    this.broadcastNow();
  }

  public clearTrades(): void {
    this.assertUnlocked();
    this.trades = [];
    this.sessionProfit = 0;
    this.saveToDisk();
    this.broadcastNow();
  }

  public async executeManualTrade(symbol: string, direction: TradeDirection): Promise<void> {
    if (!this.account || this.connectionPhase !== 'authorized') {
      throw new Error('Authorize your Deriv account before trading.');
    }
    const conf = this.marketStates[symbol]?.analysis?.confidence || 0;
    await this.placeTrade(symbol, direction, conf);
  }

  public lockWithPin(pin?: string): void {
    if (pin && pin.trim().length >= 4) {
      this.pinHash = hashPin(pin);
      this.isLocked = true;
      this.pushLog('info', 'Operator PIN set and settings locked');
    } else if (this.pinHash) {
      this.isLocked = true;
      this.pushLog('info', 'Settings locked with Operator PIN');
    } else {
      throw new Error('Enter at least a 4-digit PIN to lock settings');
    }
    this.saveToDisk();
    this.broadcastNow();
  }

  public unlockWithPin(pin: string): void {
    if (!this.pinHash) {
      this.isLocked = false;
      this.saveToDisk();
      this.broadcastNow();
      return;
    }
    if (hashPin(pin) !== this.pinHash) {
      throw new Error('Incorrect Operator PIN');
    }
    this.isLocked = false;
    this.pushLog('info', 'Settings unlocked by operator');
    this.saveToDisk();
    this.broadcastNow();
  }

  public clearPin(pin: string): void {
    if (this.pinHash && hashPin(pin) !== this.pinHash) {
      throw new Error('Incorrect current Operator PIN');
    }
    this.pinHash = null;
    this.isLocked = false;
    this.pushLog('info', 'Operator PIN removed');
    this.saveToDisk();
    this.broadcastNow();
  }
}

async function bootstrap() {
  const app = express();
  app.use(express.json());

  const runner = new AutonomousAgentRunner();

  // SSE Real-time state stream
  app.get('/api/agent/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    runner.addSseClient(res);
    req.on('close', () => {
      runner.removeSseClient(res);
    });
  });

  app.get('/api/agent/state', (_req, res) => {
    res.json(runner.getSnapshot());
  });

  app.post('/api/agent/credentials', async (req, res) => {
    try {
      const { appId, apiToken } = req.body || {};
      await runner.setCredentials(String(appId || ''), String(apiToken || ''));
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Failed to authorize credentials' });
    }
  });

  app.post('/api/agent/disconnect', async (_req, res) => {
    try {
      await runner.clearAuth();
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Failed to clear authorization' });
    }
  });

  app.post('/api/agent/reconnect', async (_req, res) => {
    try {
      await runner.connectDeriv();
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Failed to reconnect Deriv stream' });
    }
  });

  app.post('/api/agent/config', (req, res) => {
    try {
      runner.updateConfig(req.body || {});
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Failed to update configuration' });
    }
  });

  app.post('/api/agent/start', (_req, res) => {
    try {
      runner.setAgentsRunning(true);
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Unable to start agents' });
    }
  });

  app.post('/api/agent/stop', (_req, res) => {
    try {
      runner.setAgentsRunning(false);
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Unable to stop agents' });
    }
  });

  app.post('/api/agent/select-symbol', (req, res) => {
    try {
      const { symbol } = req.body || {};
      if (typeof symbol === 'string' && symbol) {
        runner.selectSymbol(symbol);
      }
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Unable to select symbol' });
    }
  });

  app.post('/api/agent/toggle-crawl', (req, res) => {
    try {
      const { symbol } = req.body || {};
      if (typeof symbol === 'string' && symbol) {
        runner.toggleCrawlSymbol(symbol);
      }
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Settings are locked. Unlock with your Operator PIN first.' });
    }
  });

  app.post('/api/agent/reset-martingale', (_req, res) => {
    try {
      runner.resetMartingale();
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Settings are locked. Unlock with your Operator PIN first.' });
    }
  });

  app.post('/api/agent/clear-trades', (_req, res) => {
    try {
      runner.clearTrades();
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res
        .status(err?.message?.includes('locked') ? 403 : 400)
        .json({ error: err?.message || 'Settings are locked. Unlock with your Operator PIN first.' });
    }
  });

  app.post('/api/agent/manual-trade', async (req, res) => {
    try {
      const { symbol, direction } = req.body || {};
      await runner.executeManualTrade(String(symbol || ''), direction);
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Manual trade rejected' });
    }
  });

  app.post('/api/agent/lock', (req, res) => {
    try {
      runner.lockWithPin(req.body?.pin);
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Failed to lock settings' });
    }
  });

  app.post('/api/agent/unlock', (req, res) => {
    try {
      runner.unlockWithPin(String(req.body?.pin || ''));
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Incorrect Operator PIN' });
    }
  });

  app.post('/api/agent/clear-pin', (req, res) => {
    try {
      runner.clearPin(String(req.body?.pin || ''));
      res.json(runner.getSnapshot());
    } catch (err: any) {
      res.status(401).json({ error: err?.message || 'Incorrect current Operator PIN' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Deriv Quant server running on http://0.0.0.0:${PORT}`);
  });
}

bootstrap();
