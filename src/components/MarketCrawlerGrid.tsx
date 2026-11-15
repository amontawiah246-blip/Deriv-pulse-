import React, { useMemo, useState } from 'react';
import { MARKET_CATEGORIES, formatSpotPrice } from '../data/markets';
import type { MarketCategory, MarketCrawlState } from '../types/deriv';
import { Search, ArrowUpRight, ArrowDownRight, Radio, CheckCircle2, Ban, Lock } from 'lucide-react';

interface MarketCrawlerGridProps {
  marketStates: Record<string, MarketCrawlState>;
  selectedSymbol: string;
  crawledSymbols: string[];
  isLocked: boolean;
  onSelectSymbol: (symbol: string) => void;
  onToggleCrawlSymbol: (symbol: string) => void;
}

function MiniSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  if (values.length < 2) {
    return <div className="h-6 w-20 bg-slate-800/80 rounded" />;
  }
  const slice = values.slice(-24);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const span = max - min || 1;
  const w = 80;
  const h = 24;
  const pts = slice
    .map((v, i) => {
      const x = (i / (slice.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline
        fill="none"
        stroke={positive ? '#10b981' : '#ef4444'}
        strokeWidth="1.5"
        points={pts}
      />
    </svg>
  );
}

export const MarketCrawlerGrid: React.FC<MarketCrawlerGridProps> = ({
  marketStates,
  selectedSymbol,
  crawledSymbols,
  isLocked,
  onSelectSymbol,
  onToggleCrawlSymbol,
}) => {
  const [category, setCategory] = useState<'all' | MarketCategory>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'score' | 'name'>('score');

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = Object.values(marketStates).filter((st) => {
      if (category !== 'all' && st.market.category !== category) return false;
      if (q) {
        return (
          st.market.symbol.toLowerCase().includes(q) ||
          st.market.displayName.toLowerCase().includes(q) ||
          st.market.categoryLabel.toLowerCase().includes(q)
        );
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'score') {
        const aScore = a.analysis?.tradeAllowed
          ? a.analysis.edgeScore + 150
          : (a.analysis?.edgeScore ?? -100);
        const bScore = b.analysis?.tradeAllowed
          ? b.analysis.edgeScore + 150
          : (b.analysis?.edgeScore ?? -100);
        if (bScore !== aScore) return bScore - aScore;
        const aCrawled = crawledSymbols.includes(a.market.symbol) ? 1 : 0;
        const bCrawled = crawledSymbols.includes(b.market.symbol) ? 1 : 0;
        if (bCrawled !== aCrawled) return bCrawled - aCrawled;
      }
      return a.market.displayName.localeCompare(b.market.displayName);
    });

    return list;
  }, [marketStates, category, search, sortBy, crawledSymbols]);

  return (
    <div className="terminal-card rounded-xl p-5 sm:p-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              Deriv Synthetic &amp; Forex Market Matrix
            </h2>
            {isLocked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {Object.keys(marketStates).length} pairs indexed · {crawledSymbols.length} live streams active · Select any pair to inspect
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search symbol or pair..."
              className="pl-9 pr-3 py-2 text-xs bg-[#0F172A] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 w-52 sm:w-56"
            />
          </div>

          <div className="flex items-center gap-1 p-1 bg-[#0F172A] border border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setSortBy('score')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                sortBy === 'score'
                  ? 'bg-[#1E293B] text-slate-100 border border-slate-700/70'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Best Setup
            </button>
            <button
              type="button"
              onClick={() => setSortBy('name')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                sortBy === 'name'
                  ? 'bg-[#1E293B] text-slate-100 border border-slate-700/70'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Alphabetical
            </button>
          </div>
        </div>
      </div>

      {/* Category Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto py-3 border-b border-slate-800/80">
        {MARKET_CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => setCategory(cat.id)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
              category === cat.id
                ? 'bg-blue-600 text-white'
                : 'bg-[#0F172A] text-slate-400 border border-slate-800 hover:bg-slate-800/80 hover:text-slate-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Dense Data Table */}
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[11px] uppercase tracking-wider font-medium text-slate-400">
              <th className="py-3 pr-4">Market</th>
              <th className="py-3 px-3 text-right">Live Spot</th>
              <th className="py-3 px-3 text-center">24-Tick Curve</th>
              <th className="py-3 px-3 text-right">Est. WR / EV</th>
              <th className="py-3 px-3">Signal &amp; Generator</th>
              <th className="py-3 px-3">Rise/Fall</th>
              <th className="py-3 pl-3 text-right">Crawler</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70 text-xs">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-slate-400">
                  No markets match your current filter.
                </td>
              </tr>
            ) : (
              items.map((st) => {
                const isSelected = st.market.symbol === selectedSymbol;
                const isCrawled = crawledSymbols.includes(st.market.symbol);
                const analysis = st.analysis;
                const quoteVals = st.ticks.map((t) => t.quote);
                const isUp =
                  st.lastPrice !== null && st.prevPrice !== null
                    ? st.lastPrice >= st.prevPrice
                    : true;

                return (
                  <tr
                    key={st.market.symbol}
                    onClick={() => onSelectSymbol(st.market.symbol)}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'bg-blue-500/10' : 'hover:bg-[#1E293B]/60'
                    }`}
                  >
                    <td className="py-2.5 pr-4">
                      <div className="font-semibold text-slate-100">{st.market.displayName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {st.market.symbol} · {st.market.categoryLabel}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums">
                      {st.lastPrice !== null ? (
                        <span className={isUp ? 'text-emerald-400' : 'text-red-400'}>
                          {formatSpotPrice(st.lastPrice, st.market.pip)}
                        </span>
                      ) : (
                        <span className="text-slate-500">Idle</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      <div className="flex justify-center">
                        <MiniSparkline values={quoteVals} positive={isUp} />
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      {analysis && analysis.indicators ? (
                        <span
                          className={`font-semibold ${
                            analysis.indicators.expectedValuePct > 0
                              ? 'text-emerald-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {analysis.confidence}% ·{' '}
                          <span
                            className={
                              analysis.indicators.expectedValuePct > 0
                                ? 'text-emerald-400'
                                : 'text-red-400'
                            }
                          >
                            {analysis.indicators.expectedValuePct >= 0 ? '+' : ''}
                            {analysis.indicators.expectedValuePct.toFixed(1)}%
                          </span>
                        </span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      {analysis && analysis.indicators ? (
                        <div className="flex items-center gap-1.5">
                          {analysis.tradeAllowed ? (
                            analysis.signal === 'CALL' ? (
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                                Rise
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 font-semibold text-red-400">
                                <ArrowDownRight className="h-3.5 w-3.5" />
                                Fall
                              </span>
                            )
                          ) : (
                            <span className="text-slate-400">Hold</span>
                          )}
                          <span className="text-slate-600">·</span>
                          <span
                            className={
                              analysis.indicators.isRngMarket ? 'text-amber-300/80' : 'text-blue-300'
                            }
                          >
                            {analysis.indicators.isRngMarket ? 'RNG' : 'FX'}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-300">{analysis.regimeLabel}</span>
                        </div>
                      ) : (
                        <span className="text-slate-500">
                          {isCrawled ? `${st.ticks.length}/55 ticks` : 'Not subscribed'}
                        </span>
                      )}
                    </td>

                    <td className="py-2.5 px-3">
                      {st.market.riseFallSupported === true ? (
                        <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-mono">{st.market.minRiseFallDuration || '5t'}</span>
                        </span>
                      ) : st.market.riseFallSupported === false ? (
                        <span className="inline-flex items-center gap-1 text-slate-500">
                          <Ban className="h-3.5 w-3.5" />
                          <span>No CALL/PUT</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">Pending</span>
                      )}
                    </td>

                    <td className="py-2.5 pl-3 text-right">
                      <button
                        type="button"
                        disabled={isLocked}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCrawlSymbol(st.market.symbol);
                        }}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                          isCrawled
                            ? 'bg-blue-500/15 text-blue-300 border border-blue-500/35 hover:bg-blue-500/25'
                            : 'bg-[#0F172A] text-slate-400 border border-slate-700/70 hover:text-slate-200 hover:bg-slate-800'
                        }`}
                      >
                        <Radio className="h-3 w-3" />
                        <span>{isCrawled ? 'Crawling' : 'Crawl'}</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
