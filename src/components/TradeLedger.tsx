import React, { useMemo } from 'react';
import type { TradeRecord } from '../types/deriv';
import { ArrowDownRight, ArrowUpRight, Download, Trash2 } from 'lucide-react';

interface TradeLedgerProps {
  trades: TradeRecord[];
  currency: string;
  isLocked: boolean;
  onClearHistory: () => void;
}

export const TradeLedger: React.FC<TradeLedgerProps> = ({
  trades,
  currency,
  isLocked,
  onClearHistory,
}) => {
  const equitySeries = useMemo(() => {
    const ordered = [...trades].reverse();
    let cum = 0;
    return ordered.map((t) => {
      cum += t.profit;
      return cum;
    });
  }, [trades]);

  const handleExportCSV = () => {
    if (trades.length === 0) return;
    const header = [
      'ContractID',
      'Symbol',
      'Market',
      'Direction',
      'Duration',
      'Stake',
      'MartingaleStep',
      'EntrySpot',
      'ExitSpot',
      'Profit',
      'SetupScore',
      'Regime',
      'SettledAt',
    ];
    const rows = trades.map((t) => [
      t.contractId,
      t.symbol,
      `"${t.displayName}"`,
      t.direction,
      `"${t.durationLabel}"`,
      t.stake.toFixed(2),
      t.martingaleStep,
      t.entrySpot,
      t.exitSpot,
      t.profit.toFixed(2),
      `${t.confidence}/100`,
      `"${t.regime}"`,
      new Date(t.settledAt).toISOString(),
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `deriv-crawler-ledger-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderEquitySVG = () => {
    if (equitySeries.length < 2) return null;
    const w = 600;
    const h = 110;
    const min = Math.min(0, ...equitySeries);
    const max = Math.max(0, ...equitySeries);
    const span = max - min || 1;
    const zeroY = h - ((0 - min) / span) * (h - 16) - 8;
    const pts = equitySeries
      .map((val, i) => {
        const x = (i / (equitySeries.length - 1)) * w;
        const y = h - ((val - min) / span) * (h - 16) - 8;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
    const lastVal = equitySeries[equitySeries.length - 1];

    return (
      <div className="mb-5 p-4 rounded-lg bg-[#0F172A] border border-slate-800">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-slate-400">Realized Session Equity Curve</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              lastVal >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {lastVal >= 0 ? '+' : ''}
            {lastVal.toFixed(2)} {currency}
          </span>
        </div>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-28 overflow-visible">
          <line
            x1="0"
            y1={zeroY}
            x2={w}
            y2={zeroY}
            stroke="#334155"
            strokeDasharray="3 3"
            strokeWidth="1"
          />
          <polyline
            fill="none"
            stroke={lastVal >= 0 ? '#10b981' : '#ef4444'}
            strokeWidth="2"
            points={pts}
          />
        </svg>
      </div>
    );
  };

  return (
    <div className="terminal-card rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-100">Executed Contract Ledger</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Live settled Deriv contracts with exact entry/exit spots and cross-pair Martingale step tracking
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCSV}
            disabled={trades.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0F172A] border border-slate-700/80 hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            onClick={onClearHistory}
            disabled={trades.length === 0 || isLocked}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div className="mt-4">{renderEquitySVG()}</div>

      {trades.length === 0 ? (
        <div className="py-12 text-center border border-dashed border-slate-700/80 rounded-lg bg-[#0F172A]/60">
          <p className="text-sm font-medium text-slate-300">No contracts executed yet</p>
          <p className="text-xs text-slate-500 mt-1">
            Authorize your Deriv account and click Start Agents or place a manual Rise/Fall trade.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider font-medium text-slate-400">
                <th className="py-2.5 pr-3">Time</th>
                <th className="py-2.5 px-3">Market</th>
                <th className="py-2.5 px-3">Direction</th>
                <th className="py-2.5 px-3 text-right">Stake / Step</th>
                <th className="py-2.5 px-3 text-right">Entry → Exit</th>
                <th className="py-2.5 px-3 text-right">Score</th>
                <th className="py-2.5 pl-3 text-right">Net P&amp;L</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {trades.map((t) => (
                <tr key={t.id} className="hover:bg-[#1E293B]/60">
                  <td className="py-2.5 pr-3 font-mono text-slate-400 whitespace-nowrap">
                    {new Date(t.settledAt).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-slate-100">{t.displayName}</div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      #{t.contractId} · {t.durationLabel}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    {t.direction === 'CALL' ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                        <ArrowUpRight className="h-3.5 w-3.5" />
                        Rise
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                        <ArrowDownRight className="h-3.5 w-3.5" />
                        Fall
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-200">
                    {t.stake.toFixed(2)} {currency} · S{t.martingaleStep}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-400">
                    {t.entrySpot} → {t.exitSpot}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-300">
                    {t.confidence}/100
                  </td>
                  <td
                    className={`py-2.5 pl-3 text-right font-mono font-bold tabular-nums ${
                      t.won ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {t.profit >= 0 ? '+' : ''}
                    {t.profit.toFixed(2)} {currency}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
