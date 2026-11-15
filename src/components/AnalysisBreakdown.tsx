import React from 'react';
import type { DeepAnalysisResult, MarketDefinition } from '../types/deriv';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, PauseCircle, ShieldAlert } from 'lucide-react';

interface AnalysisBreakdownProps {
  market: MarketDefinition;
  analysis: DeepAnalysisResult | null;
  minConfidence: number;
  minKaufmanER?: number;
}

export const AnalysisBreakdown: React.FC<AnalysisBreakdownProps> = ({
  market,
  analysis,
  minConfidence,
}) => {
  if (!analysis || !analysis.indicators) {
    return (
      <div className="terminal-card rounded-xl p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-100">
            Statistical Microstructure &amp; Edge Audit Engine
          </h3>
          <span className="text-xs font-mono text-slate-400">Warming buffer</span>
        </div>
        <p className="text-xs text-slate-400">
          {analysis?.blockReason ||
            'Collecting at least 80 live ticks from Deriv before computing Ljung-Box Q(4) p-values, multi-scale Hurst Exponent, non-overlapping walk-forward win rates, and Expected Value (EV).'}
        </p>
      </div>
    );
  }

  const ind = analysis.indicators;
  const isCall = analysis.signal === 'CALL';

  const cardClass = analysis.tradeAllowed
    ? isCall
      ? 'terminal-card-emerald'
      : 'terminal-card-crimson'
    : 'terminal-card';

  const hurstState =
    ind.hurstExponent >= 0.59
      ? 'Persistent'
      : ind.hurstExponent <= 0.41
        ? 'Anti-Persistent'
        : 'Random Walk';

  const evPositive = ind.expectedValuePct > 0;

  const metrics = [
    {
      label: 'Active Engine Mode',
      value: ind.predictiveModel,
      sub: `Regime: ${analysis.regimeLabel}`,
      bias: analysis.tradeAllowed ? (isCall ? 'RISE Trigger' : 'FALL Trigger') : 'Hold',
    },
    {
      label: 'Expected Value (per $1)',
      value: `${ind.expectedValuePct >= 0 ? '+' : ''}${ind.expectedValuePct.toFixed(2)}% EV`,
      sub: `Payout ${ind.payoutPct.toFixed(1)}% · BE ${ind.breakevenWinRate.toFixed(1)}%`,
      bias: evPositive ? 'Positive EV' : 'Negative EV',
    },
    {
      label: 'Ljung-Box Q(4) & p-Value',
      value: `Q=${ind.ljungBoxQ.toFixed(1)} (p=${ind.ljungBoxPValue.toFixed(3)})`,
      sub: 'Reject random walk if p < 0.01',
      bias: ind.ljungBoxPValue < 0.01 ? 'Non-Random' : 'White Noise',
    },
    {
      label: 'Multi-Scale Hurst (H)',
      value: `H = ${ind.hurstExponent.toFixed(2)}`,
      sub: 'VR scales q = 2, 4, 8 (0.50 = RNG)',
      bias: hurstState,
    },
    {
      label: 'Tick Return AC(1) & AC(2)',
      value: `${ind.ac1 >= 0 ? '+' : ''}${ind.ac1.toFixed(2)} / ${ind.ac2 >= 0 ? '+' : ''}${ind.ac2.toFixed(2)}`,
      sub: 'Signed lag autocorrelation',
      bias:
        ind.ac1 >= 0.08
          ? 'Continuation'
          : ind.ac1 <= -0.12
            ? 'Snapback'
            : 'Zero Memory',
    },
    {
      label: 'Non-Overlapping Walk-Fwd',
      value:
        ind.rollingWinRate !== null
          ? `${ind.rollingWinRate}% (${ind.rollingWins}/${ind.rollingSamples})`
          : `0/${ind.rollingSamples} setups`,
      sub: 'Strict non-overlapping history',
      bias:
        ind.rollingWinRate === null
          ? 'Insufficient'
          : ind.rollingWinRate >= ind.breakevenWinRate
            ? 'Above BE'
            : 'Below BE',
    },
    {
      label: 'OU Mean-Reversion Pull',
      value: `t(β) = ${ind.ouTBeta.toFixed(2)}`,
      sub: `Half-life ${ind.ouHalfLife >= 199 ? '∞' : `${ind.ouHalfLife.toFixed(1)}t`}`,
      bias: ind.ouTBeta <= -2.5 && ind.ouHalfLife <= 10 ? 'Active Pull' : 'No Pull',
    },
    {
      label: 'Equilibrium Z-Score & Entropy',
      value: `Z=${ind.zScore >= 0 ? '+' : ''}${ind.zScore.toFixed(2)}σ · ${(ind.shannonEntropy * 100).toFixed(0)}%`,
      sub: '45t stretch & 2-tick disorder',
      bias: ind.shannonEntropy < 0.96 ? 'Structured' : 'Max Disorder',
    },
    {
      label: 'Market Generator Class',
      value: ind.isRngMarket ? 'Synthetic RNG' : `Real FX (${analysis.candleCount || 0}×5m)`,
      sub: ind.isRngMarket ? 'Cryptographic GBM (~50% ceiling)' : 'Orderflow market',
      bias: ind.isRngMarket ? 'House Edge' : 'Tradable',
    },
  ];

  const qGaugePct = Math.min(100, Math.round((ind.ljungBoxQ / 20) * 100));
  const wrGaugePct = Math.min(100, Math.max(0, Math.round(((analysis.confidence - 30) / 45) * 100)));

  return (
    <div className={`${cardClass} rounded-xl p-5`}>
      <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <p className="text-xs text-slate-400">
            Empirical Statistical Audit ·{' '}
            <span className="font-mono text-slate-300">{market.symbol}</span> · {analysis.tickCount} ticks
            {analysis.candleCount ? ` · ${analysis.candleCount}×5m bars` : ''}
          </p>
          <div className="flex items-center gap-2.5 mt-1">
            <h3 className="text-base font-bold text-slate-100">
              {analysis.tradeAllowed ? (
                <span className="inline-flex items-center gap-1.5">
                  {isCall ? (
                    <ArrowUpRight className="h-5 w-5 text-emerald-400" />
                  ) : (
                    <ArrowDownRight className="h-5 w-5 text-red-400" />
                  )}
                  <span className={isCall ? 'text-emerald-400' : 'text-red-400'}>
                    {ind.predictiveModel} · {isCall ? 'RISE (CALL)' : 'FALL (PUT)'}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-slate-200">
                  <PauseCircle className="h-5 w-5 text-slate-400" />
                  <span>{ind.predictiveModel} — Capital Held</span>
                </span>
              )}
            </h3>
          </div>
        </div>

        <div className="text-right font-mono">
          <div
            className={`text-2xl font-bold tabular-nums ${
              analysis.confidence >= ind.breakevenWinRate ? 'text-emerald-400' : 'text-slate-100'
            }`}
          >
            {analysis.confidence}% <span className="text-xs font-normal text-slate-400">Est WR</span>
          </div>
          <div className="text-xs text-slate-400">
            BE {ind.breakevenWinRate.toFixed(1)}% · Min {minConfidence}% · EV{' '}
            <span className={evPositive ? 'text-emerald-400' : 'text-red-400'}>
              {ind.expectedValuePct >= 0 ? '+' : ''}
              {ind.expectedValuePct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {ind.isRngMarket && (
        <div className="mt-4 flex items-start gap-2.5 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3.5 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-300">Deriv Synthetic RNG Notice:</span>{' '}
            {market.displayName} is generated by a zero-memory cryptographic random walk (~50% theoretical max win rate vs {ind.breakevenWinRate.toFixed(1)}% needed to break even at {ind.payoutPct.toFixed(1)}% payout). Strict Statistical Edge mode refuses to fabricate high-confidence trades on coin-flip noise.
          </div>
        </div>
      )}

      {/* Dual Visual Gauges: Empirical Win Rate vs Breakeven + Ljung-Box Serial Dependence */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 mb-4">
        <div className="terminal-inset rounded-lg p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span>Empirical Walk-Forward WR</span>
            <span className="font-mono text-slate-200">
              {analysis.confidence}% / {Math.max(minConfidence, Math.ceil(ind.breakevenWinRate))}% target
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                analysis.confidence >= Math.max(minConfidence, ind.breakevenWinRate)
                  ? 'bg-emerald-500'
                  : 'bg-slate-500'
              }`}
              style={{ width: `${Math.max(4, wrGaugePct)}%` }}
            />
          </div>
        </div>

        <div className="terminal-inset rounded-lg p-3">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
            <span>Ljung-Box Q(4) Serial Memory</span>
            <span className="font-mono text-slate-200">
              {ind.ljungBoxQ.toFixed(1)} / 13.3 min (p={ind.ljungBoxPValue.toFixed(3)})
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                ind.ljungBoxQ >= 13.28 ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
              style={{ width: `${Math.max(4, qGaugePct)}%` }}
            />
          </div>
        </div>
      </div>

      {analysis.blockReason && (
        <div className="mb-4 flex items-center gap-2 text-xs text-amber-300 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{analysis.blockReason}</span>
        </div>
      )}

      {/* 9 Microstructure Modules Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {metrics.map((m) => (
          <div key={m.label} className="terminal-inset rounded-lg p-3">
            <div className="text-[11px] text-slate-400">{m.label}</div>
            <div className="mt-0.5 font-mono text-sm font-semibold text-slate-100 tabular-nums">
              {m.value}
            </div>
            <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
              <span>{m.sub}</span>
              <span className="font-medium text-slate-300">{m.bias}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Statistical Audit Rationale */}
      <div className="mt-4 pt-3 border-t border-slate-800">
        <div className="text-[11px] font-medium text-slate-400 mb-1.5">
          Statistical Audit Findings
        </div>
        <ul className="space-y-1 text-xs text-slate-300">
          {analysis.reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-blue-400 font-mono font-semibold">{i + 1}.</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
