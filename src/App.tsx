import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CURATED_DERIV_MARKETS, formatSpotPrice } from './data/markets';
import type {
  AgentConfig,
  ConnectionPhase,
  MarketCrawlState,
  MarketDefinition,
  ServerAgentSnapshot,
  TradeDirection,
} from './types/deriv';
import { LiveTickChart } from './components/LiveTickChart';
import { AnalysisBreakdown } from './components/AnalysisBreakdown';
import { MarketCrawlerGrid } from './components/MarketCrawlerGrid';
import { AgentConfigPanel } from './components/AgentConfigPanel';
import { CredentialsPanel } from './components/CredentialsPanel';
import { TradeLedger } from './components/TradeLedger';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  ChevronRight,
  KeyRound,
  Layers,
  Lock,
  Play,
  RefreshCw,
  SlidersHorizontal,
  Square,
  Unlock,
  Wallet,
  X,
} from 'lucide-react';

type DrawerKind = 'matrix' | 'rules' | 'analysis' | 'ledger' | 'credentials' | null;

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

function buildFallbackMarketStates(markets: MarketDefinition[]): Record<string, MarketCrawlState> {
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

const FALLBACK_SNAPSHOT: ServerAgentSnapshot = {
  connectionPhase: 'connecting',
  account: null,
  authError: null,
  appIdMasked: '',
  hasToken: false,
  agentsRunning: false,
  martingaleStep: 0,
  lastLossSymbol: null,
  selectedSymbol: '1HZ100V',
  crawledSymbols: ['1HZ100V', '1HZ75V', 'R_100', 'R_75'],
  sessionProfit: 0,
  activeContract: null,
  trades: [],
  logs: [],
  config: INITIAL_CONFIG,
  lock: { hasPin: false, isLocked: false },
  marketStates: buildFallbackMarketStates(CURATED_DERIV_MARKETS),
};

export default function App() {
  const [snapshot, setSnapshot] = useState<ServerAgentSnapshot>(FALLBACK_SNAPSHOT);
  const [activeDrawer, setActiveDrawer] = useState<DrawerKind>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/agent/state', {
        cache: 'no-store',
        credentials: 'same-origin',
      });
      if (!res.ok) return;
      const data = (await res.json()) as ServerAgentSnapshot;
      setSnapshot(data);
    } catch {
      // Ignore transient poll errors while server restarts
    }
  }, []);

  useEffect(() => {
    void fetchState();

    const connectSSE = () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const es = new EventSource('/api/agent/stream');
      eventSourceRef.current = es;

      es.onopen = () => {
        setSseConnected(true);
      };

      es.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data) as ServerAgentSnapshot;
          setSnapshot(data);
        } catch {
          // Ignore malformed event chunk
        }
      };

      es.onerror = () => {
        setSseConnected(false);
      };
    };

    connectSSE();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchState();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    const safetyInterval = window.setInterval(() => {
      if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
        connectSSE();
      }
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(safetyInterval);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [fetchState]);

  const postAction = useCallback(
    async (endpoint: string, body?: unknown): Promise<ServerAgentSnapshot> => {
      setActionError(null);
      const res = await fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const rawText = await res.text().catch(() => '');
      let json: any = {};
      if (rawText) {
        try {
          json = JSON.parse(rawText);
        } catch {
          json = {};
        }
      }
      if (!res.ok) {
        const msg =
          json?.error ||
          (res.status === 403
            ? 'Action blocked (403): Settings are PIN-locked or preview session expired — unlock PIN or reload.'
            : `Request failed (${res.status})`);
        setActionError(msg);
        throw new Error(msg);
      }
      const next = json as ServerAgentSnapshot;
      setSnapshot(next);
      return next;
    },
    []
  );

  const safePostAction = useCallback(
    async (endpoint: string, body?: unknown): Promise<ServerAgentSnapshot | null> => {
      try {
        return await postAction(endpoint, body);
      } catch {
        return null;
      }
    },
    [postAction]
  );

  const {
    connectionPhase,
    account,
    authError,
    appIdMasked,
    hasToken,
    agentsRunning,
    martingaleStep,
    lastLossSymbol,
    selectedSymbol,
    crawledSymbols,
    sessionProfit,
    activeContract,
    trades,
    logs,
    config,
    lock,
    marketStates,
  } = snapshot;

  const currentNextStake = useMemo(() => {
    let effectiveBase = Math.max(0.35, config.baseStake);
    const bal = account?.balance ?? 0;
    if (config.bankrollRiskGuard && bal >= 0.35) {
      let chainFactor = 0;
      for (let s = 0; s <= config.maxMartingaleSteps; s++) {
        chainFactor += Math.pow(config.martingaleMultiplier, s);
      }
      const maxCycleBudget = bal * (Math.max(1, Math.min(25, config.maxCycleRiskPct)) / 100);
      const safeBase = Math.max(
        0.35,
        Math.floor((maxCycleBudget / Math.max(1, chainFactor)) * 100) / 100
      );
      effectiveBase = Math.min(effectiveBase, safeBase);
    }
    const raw = effectiveBase * Math.pow(config.martingaleMultiplier, martingaleStep);
    const effectiveCap = Math.max(effectiveBase, config.maxStakeCap);
    return martingaleStep === 0
      ? Number(Math.max(0.35, effectiveBase).toFixed(2))
      : Number(Math.min(effectiveCap, Math.max(0.35, raw)).toFixed(2));
  }, [
    account?.balance,
    config.bankrollRiskGuard,
    config.baseStake,
    config.martingaleMultiplier,
    config.maxCycleRiskPct,
    config.maxMartingaleSteps,
    config.maxStakeCap,
    martingaleStep,
  ]);

  const selectedState =
    marketStates[selectedSymbol] || Object.values(marketStates)[0] || null;
  const currency = account?.currency || 'USD';

  const winRate = useMemo(() => {
    if (trades.length === 0) return 0;
    const wins = trades.filter((t) => t.won).length;
    return Math.round((wins / trades.length) * 100);
  }, [trades]);

  const radarMarkets = useMemo(() => {
    return crawledSymbols
      .map((sym) => marketStates[sym])
      .filter((st): st is MarketCrawlState => Boolean(st))
      .sort((a, b) => {
        const aScore = a.analysis?.tradeAllowed
          ? a.analysis.edgeScore + 150
          : (a.analysis?.edgeScore ?? -1);
        const bScore = b.analysis?.tradeAllowed
          ? b.analysis.edgeScore + 150
          : (b.analysis?.edgeScore ?? -1);
        return bScore - aScore;
      });
  }, [crawledSymbols, marketStates]);

  const handleToggleAgents = async () => {
    try {
      if (agentsRunning) {
        await postAction('/api/agent/stop');
      } else {
        await postAction('/api/agent/start');
      }
    } catch {
      if (!account) {
        setActiveDrawer('credentials');
      }
    }
  };

  const handleManualTrade = async (dir: TradeDirection) => {
    try {
      await postAction('/api/agent/manual-trade', {
        symbol: selectedSymbol,
        direction: dir,
      });
    } catch {
      if (!account) {
        setActiveDrawer('credentials');
      }
    }
  };

  const handleSelectSymbol = async (sym: string) => {
    try {
      await postAction('/api/agent/select-symbol', { symbol: sym });
    } catch {
      // Handled via actionError
    }
  };

  const handleToggleCrawl = async (sym: string) => {
    try {
      await postAction('/api/agent/toggle-crawl', { symbol: sym });
    } catch {
      // Handled via actionError
    }
  };

  const handleConfigChange = async (next: AgentConfig) => {
    try {
      await postAction('/api/agent/config', next);
    } catch {
      // Handled via actionError
    }
  };

  const handleConnectCredentials = async (appId: string, token: string) => {
    try {
      await postAction('/api/agent/credentials', { appId, apiToken: token });
      setActiveDrawer(null);
    } catch {
      // authError displays in drawer
    }
  };

  const statusMeta: Record<ConnectionPhase, { label: string; dot: string; text: string }> = {
    authorized: {
      label: account?.isVirtual ? 'Demo Live' : 'Real Live',
      dot: 'bg-emerald-500',
      text: 'text-emerald-400',
    },
    observer: {
      label: 'Observer Stream',
      dot: 'bg-blue-500',
      text: 'text-blue-400',
    },
    authorizing: {
      label: 'Authorizing',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
    },
    connecting: {
      label: 'Connecting',
      dot: 'bg-amber-400',
      text: 'text-amber-300',
    },
    error: {
      label: 'Reconnecting',
      dot: 'bg-red-500',
      text: 'text-red-400',
    },
    disconnected: {
      label: 'Offline',
      dot: 'bg-slate-500',
      text: 'text-slate-400',
    },
  };

  const phaseUi = statusMeta[connectionPhase];

  // Gauge percentages for Quant Signal Radar
  const analysis = selectedState?.analysis ?? null;
  const confPct = analysis ? Math.min(100, Math.max(0, analysis.confidence)) : 0;
  const lbQVal = analysis?.indicators ? analysis.indicators.ljungBoxQ : 0;
  const lbQGaugePct = Math.min(100, Math.round((lbQVal / 20) * 100));

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100">
      {/* Institutional Sleek Header */}
      <header className="sticky top-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-b border-slate-800/90">
        <div className="max-w-[1440px] mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
          {/* Left: Brand + Connection Indicator */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center shrink-0">
              <Activity className="h-4 w-4 text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display font-bold text-sm sm:text-base tracking-tight text-slate-100 truncate">
                  Deriv Quant
                </span>
                <span className="hidden sm:inline text-[11px] font-mono text-slate-500 uppercase tracking-wider">
                  HFT Terminal
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px]">
                <span className={`h-1.5 w-1.5 rounded-full ${phaseUi.dot}`} />
                <span className={`font-medium ${phaseUi.text}`}>{phaseUi.label}</span>
                {!sseConnected && (
                  <span className="text-amber-400 font-mono">· Syncing</span>
                )}
              </div>
            </div>
          </div>

          {/* Center Nav (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveDrawer('matrix')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-[#1E293B] transition-colors"
            >
              Market Matrix ({crawledSymbols.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer('rules')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-[#1E293B] transition-colors"
            >
              Rules &amp; PIN
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer('ledger')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-[#1E293B] transition-colors"
            >
              Ledger ({trades.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveDrawer('credentials')}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-slate-100 hover:bg-[#1E293B] transition-colors"
            >
              API Setup
            </button>
          </nav>

          {/* Right: Lock Indicator + Primary Rectangular Action Button */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveDrawer('rules')}
              title={lock.isLocked ? 'Settings Locked by Operator PIN' : 'Operator PIN Lock'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors ${
                lock.isLocked
                  ? 'bg-amber-500/10 border-amber-500/35 text-amber-300 hover:bg-amber-500/20'
                  : 'bg-[#131C2E] border-slate-700/70 text-slate-300 hover:bg-[#1E293B]'
              }`}
            >
              {lock.isLocked ? (
                <Lock className="h-3.5 w-3.5" />
              ) : (
                <Unlock className="h-3.5 w-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">{lock.isLocked ? 'Locked' : 'PIN'}</span>
            </button>

            <button
              type="button"
              onClick={() => void safePostAction('/api/agent/reconnect')}
              title="Reconnect Deriv Stream"
              className="p-2 rounded-lg bg-[#131C2E] border border-slate-700/70 text-slate-300 hover:text-slate-100 hover:bg-[#1E293B] transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => void handleToggleAgents()}
              className={`inline-flex items-center gap-2 px-3.5 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold text-white transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                agentsRunning
                  ? 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 shadow-lg shadow-red-950/50'
                  : 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 shadow-lg shadow-blue-950/60'
              }`}
            >
              {agentsRunning ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-current" />
                  <span>Stop Agents</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" />
                  <span>Start Agents</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-6 py-4 sm:py-6 space-y-4 sm:space-y-5 pb-20 lg:pb-8">
        {/* Low Balance Notice */}
        {account && account.balance < 0.35 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/35 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                Account balance is <strong className="font-mono">{account.balance.toFixed(2)} {account.currency}</strong> (below Deriv&apos;s 0.35 minimum stake). Reset your Demo balance in Deriv Trader and click Reconnect to resume.
              </span>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {(actionError || authError) && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/35 text-xs text-red-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
              <span>{actionError || authError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-red-300 hover:text-white shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Top Focal Row: Account Balance Hero + Technical Rule Readout + Market + Session P&L */}
        <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {/* 1. Account / Balance Hero Card (Most prominent USD figure) */}
          <button
            type="button"
            onClick={() => setActiveDrawer('credentials')}
            className="terminal-card terminal-card-interactive rounded-xl p-4 sm:p-5 text-left flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-blue-400" />
                Account Balance
              </span>
              <span
                className={`text-[11px] font-mono px-2 py-0.5 rounded border ${
                  account
                    ? account.isVirtual
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-red-500/10 border-red-500/30 text-red-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {account ? (account.isVirtual ? 'DEMO' : 'REAL') : 'OBSERVER'}
              </span>
            </div>

            <div className="mt-3">
              <div className="font-mono font-bold text-3xl sm:text-[34px] leading-none tracking-tight text-slate-50 tabular-nums">
                {account ? account.balance.toFixed(2) : '—'}
                <span className="ml-1.5 text-sm font-semibold text-slate-400">{currency}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono truncate">
                  {account ? account.loginid : 'Tap to authorize API'}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              </div>
            </div>
          </button>

          {/* 2. Active Rules (Martingale Technical Readout + PIN Lock) */}
          <button
            type="button"
            onClick={() => setActiveDrawer('rules')}
            className="terminal-card terminal-card-interactive rounded-xl p-4 sm:p-5 text-left flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
                Active Rules · Martingale
              </span>
              <span
                className={`inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded border ${
                  lock.isLocked
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300'
                }`}
              >
                {lock.isLocked ? <Lock className="h-2.5 w-2.5" /> : <Unlock className="h-2.5 w-2.5" />}
                {lock.isLocked ? 'PIN LOCKED' : 'EDITABLE'}
              </span>
            </div>

            <div className="mt-3">
              <div className="flex items-baseline gap-2.5 font-mono">
                <span className="text-xl sm:text-2xl font-bold text-slate-100 tabular-nums">
                  {currentNextStake.toFixed(2)} {currency}
                </span>
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-[#0F172A] border border-slate-700 text-blue-400 tabular-nums">
                  S{martingaleStep}/{config.maxMartingaleSteps}
                </span>
                <span className="text-xs text-slate-400 tabular-nums">
                  {config.martingaleMultiplier}x
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span className="truncate font-mono">
                  {config.crossPairMartingale ? 'Cross-Pair Recovery' : 'Standard'} ·{' '}
                  {config.enableTakeProfit ? `TP ${config.takeProfitTarget}` : 'Continuous 24/7'}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              </div>
            </div>
          </button>

          {/* 3. Focused Market Card */}
          <button
            type="button"
            onClick={() => setActiveDrawer('matrix')}
            className="terminal-card terminal-card-interactive rounded-xl p-4 sm:p-5 text-left flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-blue-400" />
                Focused Market
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {crawledSymbols.length} Streams
              </span>
            </div>

            <div className="mt-3">
              <div className="text-base sm:text-lg font-bold text-slate-100 truncate">
                {selectedState?.market.displayName || selectedSymbol}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-mono font-semibold text-blue-400 tabular-nums">
                  {selectedState?.lastPrice != null
                    ? formatSpotPrice(selectedState.lastPrice, selectedState.market.pip)
                    : 'Waiting tick...'}
                </span>
                <span className="text-slate-400 inline-flex items-center gap-1">
                  Switch Pair
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                </span>
              </div>
            </div>
          </button>

          {/* 4. Session Realized P&L Card */}
          <button
            type="button"
            onClick={() => setActiveDrawer('ledger')}
            className="terminal-card terminal-card-interactive rounded-xl p-4 sm:p-5 text-left flex flex-col justify-between"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
                Session Realized P&amp;L
              </span>
              <span className="text-[11px] font-mono text-slate-400 tabular-nums">
                {trades.length} Trades · {winRate}% WR
              </span>
            </div>

            <div className="mt-3">
              <div
                className={`font-mono font-bold text-2xl sm:text-[26px] leading-none tabular-nums ${
                  sessionProfit >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {sessionProfit >= 0 ? '+' : ''}
                {sessionProfit.toFixed(2)} {currency}
              </div>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                <span>
                  {lastLossSymbol && martingaleStep > 0
                    ? `Cooldown: ${lastLossSymbol}`
                    : 'Realized Equity Ledger'}
                </span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              </div>
            </div>
          </button>
        </section>

        {/* Main Terminal Grid: Chart + Execution & Quant Gauge (Left 8 cols) | Watchlist & Feed (Right 4 cols) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
          {/* Left Execution & Chart Column */}
          <div className="lg:col-span-8 space-y-4">
            {/* Live Tick Chart */}
            {selectedState && (
              <LiveTickChart
                market={selectedState.market}
                ticks={selectedState.ticks}
                analysis={selectedState.analysis}
                activeContract={activeContract}
              />
            )}

            {/* Open Live Contract Banner (when executing) */}
            {activeContract && (
              <div className="terminal-card-blue rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded text-xs font-mono font-bold ${
                      activeContract.direction === 'CALL'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                        : 'bg-red-500/15 text-red-400 border border-red-500/35'
                    }`}
                  >
                    {activeContract.direction === 'CALL' ? 'RISE' : 'FALL'}
                  </span>
                  <div>
                    <div className="text-xs font-semibold text-slate-100">
                      {activeContract.displayName}{' '}
                      <span className="font-mono text-slate-400">#{activeContract.contractId}</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 tabular-nums">
                      Stake {activeContract.buyPrice.toFixed(2)} {activeContract.currency} · Entry{' '}
                      {activeContract.entrySpot ?? '—'} · Spot {activeContract.currentSpot ?? '—'}
                    </div>
                  </div>
                </div>
                <div
                  className={`font-mono font-bold text-sm tabular-nums ${
                    activeContract.profit >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {activeContract.profit >= 0 ? '+' : ''}
                  {activeContract.profit.toFixed(2)} {activeContract.currency}
                </div>
              </div>
            )}

            {/* Institutional Execution Controls */}
            <div className="terminal-card rounded-xl p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                  Direct Order Execution ·{' '}
                  <span className="text-slate-200 font-mono">{selectedSymbol}</span>
                </div>
                <div className="text-xs font-mono text-slate-400 tabular-nums">
                  Order Size:{' '}
                  <span className="text-slate-100 font-semibold">
                    {currentNextStake.toFixed(2)} {currency}
                  </span>{' '}
                  · {selectedState?.market.minRiseFallDuration || '5t'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={!account || Boolean(activeContract)}
                  onClick={() => void handleManualTrade('CALL')}
                  className="group relative flex items-center justify-between px-4 py-3.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-emerald-950/50"
                >
                  <div className="text-left">
                    <div className="text-sm font-bold leading-tight">Buy Rise</div>
                    <div className="text-[11px] font-mono text-emerald-100/85">CALL CONTRACT</div>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-white shrink-0" />
                </button>

                <button
                  type="button"
                  disabled={!account || Boolean(activeContract)}
                  onClick={() => void handleManualTrade('PUT')}
                  className="group relative flex items-center justify-between px-4 py-3.5 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-red-950/50"
                >
                  <div className="text-left">
                    <div className="text-sm font-bold leading-tight">Buy Fall</div>
                    <div className="text-[11px] font-mono text-red-100/85">PUT CONTRACT</div>
                  </div>
                  <ArrowDownRight className="h-5 w-5 text-white shrink-0" />
                </button>
              </div>
            </div>

            {/* Quant Signal Radar with Visual Confidence & Kaufman ER Meters (Tap for Full Breakdown) */}
            <button
              type="button"
              onClick={() => setActiveDrawer('analysis')}
              className="w-full terminal-card terminal-card-interactive rounded-xl p-4 sm:p-5 text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-slate-800/80">
                <div className="flex items-center gap-2.5">
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">
                    Quant Signal
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                      analysis?.tradeAllowed
                        ? analysis.signal === 'CALL'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35'
                          : 'bg-red-500/15 text-red-400 border border-red-500/35'
                        : 'bg-slate-800 text-slate-300 border border-slate-700'
                    }`}
                  >
                    {analysis?.tradeAllowed
                      ? analysis.signal === 'CALL'
                        ? 'EXECUTE RISE'
                        : 'EXECUTE FALL'
                      : 'HOLD'}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-mono">
                    {analysis?.indicators?.predictiveModel || analysis?.regimeLabel || 'Warming'} ·{' '}
                    {analysis?.indicators?.isRngMarket ? 'RNG' : 'FX'} · {analysis?.confluenceCount ?? 0}/6 Checks
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Empirical Walk-Forward WR vs Breakeven Gauge */}
                <div className="rounded-lg bg-[#0F172A] border border-slate-800 p-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400 font-medium">Empirical Win Rate (Walk-Fwd)</span>
                    <span className="font-mono font-bold text-slate-100 tabular-nums">
                      {confPct}%{' '}
                      <span className="text-slate-500 font-normal">
                        / {analysis?.indicators ? `${analysis.indicators.breakevenWinRate.toFixed(1)}% BE` : `${config.minConfidence}% min`}
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        analysis?.indicators && confPct >= Math.max(config.minConfidence, analysis.indicators.breakevenWinRate)
                          ? 'bg-emerald-500'
                          : 'bg-slate-500'
                      }`}
                      style={{ width: `${Math.min(100, Math.max(4, Math.round(((confPct - 30) / 45) * 100)))}%` }}
                    />
                  </div>
                </div>

                {/* Ljung-Box Q(4) Serial Memory Gauge */}
                <div className="rounded-lg bg-[#0F172A] border border-slate-800 p-3">
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="text-slate-400 font-medium">Ljung-Box Q(4) Serial Test</span>
                    <span className="font-mono font-bold text-slate-100 tabular-nums">
                      {lbQVal.toFixed(1)}{' '}
                      <span className="text-slate-500 font-normal">
                        / 13.3 min ({analysis?.indicators ? `p=${analysis.indicators.ljungBoxPValue.toFixed(2)}` : 'p=1.00'})
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        lbQVal >= 13.28 ? 'bg-emerald-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${Math.max(4, lbQGaugePct)}%` }}
                    />
                  </div>
                </div>
              </div>

              {analysis?.indicators && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-400">
                  <span>
                    EV{' '}
                    <strong className={analysis.indicators.expectedValuePct > 0 ? 'text-emerald-400' : 'text-red-400'}>
                      {analysis.indicators.expectedValuePct >= 0 ? '+' : ''}
                      {analysis.indicators.expectedValuePct.toFixed(1)}%
                    </strong>
                  </span>
                  <span>
                    Hurst <strong className={analysis.indicators.hurstExponent >= 0.59 || analysis.indicators.hurstExponent <= 0.41 ? 'text-amber-300' : 'text-slate-200'}>{analysis.indicators.hurstExponent.toFixed(2)}</strong>
                  </span>
                  <span>
                    AC(1) <strong className="text-slate-200">{analysis.indicators.ac1 >= 0 ? '+' : ''}{analysis.indicators.ac1.toFixed(2)}</strong>
                  </span>
                  <span>
                    Z <strong className="text-slate-200">{analysis.indicators.zScore >= 0 ? '+' : ''}{analysis.indicators.zScore.toFixed(2)}σ</strong>
                  </span>
                  <span>
                    Walk-Fwd{' '}
                    <strong className={analysis.indicators.rollingWinRate !== null && analysis.indicators.rollingWinRate >= analysis.indicators.breakevenWinRate ? 'text-emerald-400' : 'text-slate-200'}>
                      {analysis.indicators.rollingWinRate !== null ? `${analysis.indicators.rollingWinRate}%` : '—'}
                    </strong>{' '}
                    ({analysis.indicators.rollingWins}/{analysis.indicators.rollingSamples})
                  </span>
                </div>
              )}

              {analysis?.blockReason && !analysis.tradeAllowed && (
                <p className="mt-2.5 text-[11px] text-slate-400 font-mono truncate">
                  Gate: {analysis.blockReason}
                </p>
              )}
            </button>
          </div>

          {/* Right Column: Order-Book Style Market Watchlist + Live Agent Feed */}
          <aside className="lg:col-span-4 space-y-4">
            {/* Market Watchlist / Order-Book Radar */}
            <div className="terminal-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    Crawled Watchlist
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Ranked by empirical EV &amp; edge
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveDrawer('matrix')}
                  className="text-xs font-medium text-blue-400 hover:text-blue-300"
                >
                  All Pairs
                </button>
              </div>

              <div className="px-4 py-2 bg-[#0F172A] border-b border-slate-800/80 grid grid-cols-12 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                <span className="col-span-5">Instrument</span>
                <span className="col-span-3 text-right">Spot</span>
                <span className="col-span-2 text-right">Est WR</span>
                <span className="col-span-2 text-right">Bias</span>
              </div>

              <div className="divide-y divide-slate-800/60 max-h-[340px] overflow-y-auto">
                {radarMarkets.map((st) => {
                  const isSelected = st.market.symbol === selectedSymbol;
                  const a = st.analysis;
                  const isUp =
                    st.lastPrice !== null && st.prevPrice !== null
                      ? st.lastPrice >= st.prevPrice
                      : true;

                  return (
                    <button
                      key={st.market.symbol}
                      type="button"
                      onClick={() => void handleSelectSymbol(st.market.symbol)}
                      className={`w-full px-4 py-2.5 grid grid-cols-12 items-center text-left transition-colors ${
                        isSelected
                          ? 'bg-blue-500/12 border-l-2 border-l-blue-500'
                          : 'hover:bg-[#1E293B]/60'
                      }`}
                    >
                      <div className="col-span-5 min-w-0 pr-2">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {st.market.displayName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 truncate">
                          {st.market.symbol}
                        </div>
                      </div>

                      <div
                        className={`col-span-3 text-right font-mono text-xs font-semibold tabular-nums ${
                          st.lastPrice != null
                            ? isUp
                              ? 'text-emerald-400'
                              : 'text-red-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {st.lastPrice != null
                          ? formatSpotPrice(st.lastPrice, st.market.pip)
                          : '—'}
                      </div>

                      <div className="col-span-2 text-right font-mono text-xs text-slate-300 tabular-nums">
                        {a && a.indicators ? `${a.confidence}` : `${st.ticks.length}t`}
                      </div>

                      <div className="col-span-2 text-right font-mono text-[11px] font-bold">
                        {a?.tradeAllowed ? (
                          <span className={a.signal === 'CALL' ? 'text-emerald-400' : 'text-red-400'}>
                            {a.signal === 'CALL' ? 'RISE' : 'FALL'}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-normal">HOLD</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Live Agent Execution Feed */}
            <div className="terminal-card rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                  Execution Feed
                </h3>
                <span className="text-[11px] font-mono text-slate-500">
                  {agentsRunning ? 'Auto-Running' : 'Standby'}
                </span>
              </div>

              <div className="p-3 space-y-2 max-h-[280px] overflow-y-auto bg-[#0F172A]/60">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No execution events recorded yet.
                  </p>
                ) : (
                  logs.slice(0, 30).map((log) => {
                    const tone =
                      log.type === 'win'
                        ? 'text-emerald-400 border-emerald-500/20'
                        : log.type === 'loss' || log.type === 'warn'
                        ? 'text-red-400 border-red-500/20'
                        : log.type === 'trade' || log.type === 'switch'
                        ? 'text-blue-400 border-blue-500/20'
                        : 'text-slate-300 border-slate-800';

                    return (
                      <div
                        key={log.id}
                        className={`px-3 py-2 rounded-lg bg-[#131C2E] border text-[11px] leading-relaxed ${tone}`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500 mb-0.5">
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                          {log.symbol && <span className="text-slate-400">{log.symbol}</span>}
                        </div>
                        <div className="text-slate-200">{log.message}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        </section>
      </main>

      {/* Mobile Bottom Dock Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#0F172A]/95 backdrop-blur-md border-t border-slate-800 grid grid-cols-4">
        <button
          type="button"
          onClick={() => setActiveDrawer('matrix')}
          className="py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white"
        >
          <Layers className="h-4 w-4 text-blue-400" />
          <span>Markets</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveDrawer('rules')}
          className="py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white"
        >
          <SlidersHorizontal className="h-4 w-4 text-amber-400" />
          <span>Rules/PIN</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveDrawer('ledger')}
          className="py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white"
        >
          <BarChart3 className="h-4 w-4 text-emerald-400" />
          <span>Ledger</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveDrawer('credentials')}
          className="py-2.5 flex flex-col items-center gap-1 text-[11px] font-medium text-slate-300 hover:text-white"
        >
          <KeyRound className="h-4 w-4 text-slate-300" />
          <span>API</span>
        </button>
      </nav>

      {/* Tap-to-Open Drawers */}
      {activeDrawer && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setActiveDrawer(null)}
        >
          <div
            className="w-full max-w-5xl max-h-[92vh] overflow-y-auto bg-[#0B1120] border border-slate-800 rounded-t-2xl sm:rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 px-4 sm:px-6 py-3.5 bg-[#0F172A] border-b border-slate-800 flex items-center justify-between">
              <span className="text-sm font-bold text-slate-100">
                {activeDrawer === 'matrix' && 'Market Matrix & Live Crawlers'}
                {activeDrawer === 'rules' && 'Execution Rules, Martingale & Operator PIN Lock'}
                {activeDrawer === 'analysis' && 'Full Deep Quantitative Breakdown'}
                {activeDrawer === 'ledger' && 'Realized Contract Ledger'}
                {activeDrawer === 'credentials' && 'Deriv API Connection & Account'}
              </span>
              <button
                type="button"
                onClick={() => setActiveDrawer(null)}
                className="p-1.5 rounded-lg bg-[#131C2E] border border-slate-700/70 text-slate-300 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-6">
              {activeDrawer === 'matrix' && (
                <MarketCrawlerGrid
                  marketStates={marketStates}
                  selectedSymbol={selectedSymbol}
                  crawledSymbols={crawledSymbols}
                  isLocked={lock.isLocked}
                  onSelectSymbol={(sym) => {
                    void handleSelectSymbol(sym);
                    setActiveDrawer(null);
                  }}
                  onToggleCrawlSymbol={(sym) => void handleToggleCrawl(sym)}
                />
              )}

              {activeDrawer === 'rules' && (
                <AgentConfigPanel
                  config={config}
                  currency={currency}
                  accountBalance={account?.balance}
                  martingaleStep={martingaleStep}
                  currentNextStake={currentNextStake}
                  lastLossSymbol={lastLossSymbol}
                  lock={lock}
                  onChange={(next) => void handleConfigChange(next)}
                  onResetMartingale={() => void safePostAction('/api/agent/reset-martingale')}
                  onLockWithPin={async (pin) => {
                    await postAction('/api/agent/lock', { pin });
                  }}
                  onUnlockWithPin={async (pin) => {
                    await postAction('/api/agent/unlock', { pin });
                  }}
                  onClearPin={async (pin) => {
                    await postAction('/api/agent/clear-pin', { pin });
                  }}
                />
              )}

              {activeDrawer === 'analysis' && selectedState && (
                <AnalysisBreakdown
                  market={selectedState.market}
                  analysis={selectedState.analysis}
                  minConfidence={config.minConfidence}
                  minKaufmanER={config.minKaufmanER}
                />
              )}

              {activeDrawer === 'ledger' && (
                <TradeLedger
                  trades={trades}
                  currency={currency}
                  isLocked={lock.isLocked}
                  onClearHistory={() => void safePostAction('/api/agent/clear-trades')}
                />
              )}

              {activeDrawer === 'credentials' && (
                <CredentialsPanel
                  appIdMasked={appIdMasked}
                  hasToken={hasToken}
                  isLocked={lock.isLocked}
                  connectionPhase={connectionPhase}
                  account={account}
                  authError={authError}
                  onConnectAndAuthorize={(appId, token) =>
                    void handleConnectCredentials(appId, token)
                  }
                  onDisconnectAuth={() => void safePostAction('/api/agent/disconnect')}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
