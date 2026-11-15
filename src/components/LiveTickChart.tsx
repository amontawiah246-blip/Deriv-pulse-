import React, { useMemo, useState } from 'react';
import { formatSpotPrice } from '../data/markets';
import type { ActiveContractState, DeepAnalysisResult, MarketDefinition, TickPoint } from '../types/deriv';

interface LiveTickChartProps {
  market: MarketDefinition;
  ticks: TickPoint[];
  analysis: DeepAnalysisResult | null;
  activeContract: ActiveContractState | null;
}

export const LiveTickChart: React.FC<LiveTickChartProps> = ({
  market,
  ticks,
  analysis,
  activeContract,
}) => {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visibleCount = 75;
  const chartData = useMemo(() => {
    const start = Math.max(0, ticks.length - visibleCount);
    const slicedTicks = ticks.slice(start);
    const ema9 = analysis?.ema9Series.slice(start) || [];
    const ema21 = analysis?.ema21Series.slice(start) || [];
    const bbUpper = analysis?.bbUpperSeries.slice(start) || [];
    const bbLower = analysis?.bbLowerSeries.slice(start) || [];
    return { slicedTicks, ema9, ema21, bbUpper, bbLower };
  }, [ticks, analysis]);

  const { slicedTicks, ema9, ema21, bbUpper, bbLower } = chartData;

  const width = 820;
  const height = 268;
  const padLeft = 12;
  const padRight = 72;
  const padTop = 16;
  const padBottom = 24;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const bounds = useMemo(() => {
    if (slicedTicks.length === 0) return { min: 0, max: 1 };
    const allVals: number[] = slicedTicks.map((t) => t.quote);
    bbUpper.forEach((v) => v && allVals.push(v));
    bbLower.forEach((v) => v && allVals.push(v));
    if (
      activeContract &&
      activeContract.symbol === market.symbol &&
      activeContract.entrySpot !== null
    ) {
      allVals.push(activeContract.entrySpot);
    }
    const rawMin = Math.min(...allVals);
    const rawMax = Math.max(...allVals);
    const span = rawMax - rawMin || market.pip * 10 || 1;
    return {
      min: rawMin - span * 0.1,
      max: rawMax + span * 0.1,
    };
  }, [slicedTicks, bbUpper, bbLower, activeContract, market.symbol, market.pip]);

  const toX = (idx: number, total: number) => {
    if (total <= 1) return padLeft;
    return padLeft + (idx / (total - 1)) * plotW;
  };

  const toY = (val: number) => {
    const span = bounds.max - bounds.min || 1;
    return padTop + ((bounds.max - val) / span) * plotH;
  };

  const buildPath = (series: number[]) => {
    if (series.length < 2) return '';
    return series
      .map((val, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, slicedTicks.length).toFixed(2)} ${toY(val).toFixed(2)}`)
      .join(' ');
  };

  const priceValues = slicedTicks.map((t) => t.quote);
  const pricePath = buildPath(priceValues);
  const ema9Path = buildPath(ema9);
  const ema21Path = buildPath(ema21);

  const areaPath = useMemo(() => {
    if (priceValues.length < 2) return '';
    const lastX = toX(priceValues.length - 1, priceValues.length).toFixed(2);
    const firstX = toX(0, priceValues.length).toFixed(2);
    const bottomY = (padTop + plotH).toFixed(2);
    return `${pricePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [pricePath, priceValues.length, plotH]);

  const bbPolygonPath = useMemo(() => {
    if (bbUpper.length < 2 || bbLower.length < 2) return '';
    const topPts = bbUpper.map(
      (v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i, slicedTicks.length).toFixed(2)} ${toY(v).toFixed(2)}`
    );
    const botPts = [...bbLower]
      .reverse()
      .map((v, revIdx) => {
        const origIdx = bbLower.length - 1 - revIdx;
        return `L ${toX(origIdx, slicedTicks.length).toFixed(2)} ${toY(v).toFixed(2)}`;
      });
    return `${topPts.join(' ')} ${botPts.join(' ')} Z`;
  }, [bbUpper, bbLower, slicedTicks.length, bounds]);

  const latestTick = slicedTicks[slicedTicks.length - 1] || null;
  const prevTick = slicedTicks[slicedTicks.length - 2] || latestTick;
  const isUp = latestTick && prevTick ? latestTick.quote >= prevTick.quote : true;

  const yTicks = useMemo(() => {
    const steps = 4;
    const arr: number[] = [];
    const span = bounds.max - bounds.min;
    for (let i = 0; i <= steps; i++) {
      arr.push(bounds.min + (span * i) / steps);
    }
    return arr;
  }, [bounds]);

  const inspectedIdx = hoverIdx !== null && hoverIdx < slicedTicks.length ? hoverIdx : null;
  const inspectedTick = inspectedIdx !== null ? slicedTicks[inspectedIdx] : null;

  const entrySpotY =
    activeContract &&
    activeContract.symbol === market.symbol &&
    activeContract.entrySpot !== null
      ? toY(activeContract.entrySpot)
      : null;

  return (
    <div className="relative w-full rounded-lg terminal-inset p-3">
      {slicedTicks.length < 2 ? (
        <div className="h-[268px] flex flex-col items-center justify-center rounded-lg">
          <div className="h-5 w-5 rounded-full border-2 border-blue-500 border-t-transparent animate-spin mb-2.5" />
          <p className="text-xs font-medium text-slate-300">
            Streaming live Deriv ticks for {market.displayName}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            Connecting to Deriv Options feed
          </p>
        </div>
      ) : (
        <div className="relative select-none">
          {/* Legend + Hover Readout */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-[11px] text-slate-400">
            <div className="flex items-center gap-3.5">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-blue-400 inline-block" />
                <span>Spot</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 bg-emerald-400 inline-block" />
                <span>EMA 9 (Green)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-3 border-t border-dashed border-amber-400 inline-block" />
                <span>EMA 21 (Yellow)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-xs bg-blue-500/20 border border-blue-500/30 inline-block" />
                <span>2σ Envelope</span>
              </span>
            </div>
            {inspectedTick && inspectedIdx !== null ? (
              <div className="font-mono text-slate-300">
                <span>
                  {new Date(inspectedTick.epoch * 1000).toLocaleTimeString()} ·{' '}
                  <strong className="text-white">
                    {formatSpotPrice(inspectedTick.quote, market.pip)}
                  </strong>
                  {ema9[inspectedIdx] ? ` · EMA9 ${formatSpotPrice(ema9[inspectedIdx], market.pip)}` : ''}
                </span>
              </div>
            ) : (
              <div className="font-mono text-slate-500">
                Last {slicedTicks.length} ticks
              </div>
            )}
          </div>

          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-[250px] sm:h-[268px] overflow-visible"
            onMouseLeave={() => setHoverIdx(null)}
            onMouseMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const relX = ((e.clientX - rect.left) / rect.width) * width;
              const clamped = Math.max(padLeft, Math.min(padLeft + plotW, relX));
              const ratio = (clamped - padLeft) / plotW;
              const idx = Math.round(ratio * (slicedTicks.length - 1));
              setHoverIdx(idx);
            }}
          >
            <defs>
              <linearGradient id="darkTickAreaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid Lines & Y-Axis Labels */}
            {yTicks.map((val, idx) => {
              const y = toY(val);
              return (
                <g key={idx}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={padLeft + plotW}
                    y2={y}
                    stroke="#1e293b"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                  />
                  <text
                    x={padLeft + plotW + 8}
                    y={y + 4}
                    className="fill-slate-500 text-[10px] font-mono"
                  >
                    {formatSpotPrice(val, market.pip)}
                  </text>
                </g>
              );
            })}

            {/* Bollinger Band Envelope */}
            {bbPolygonPath && <path d={bbPolygonPath} fill="rgba(59, 130, 246, 0.08)" />}

            {/* Area under price */}
            {areaPath && <path d={areaPath} fill="url(#darkTickAreaGrad)" />}

            {/* EMA 21 */}
            {ema21Path && (
              <path
                d={ema21Path}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="1.3"
                strokeDasharray="4 3"
              />
            )}

            {/* EMA 9 */}
            {ema9Path && (
              <path d={ema9Path} fill="none" stroke="#10b981" strokeWidth="1.5" />
            )}

            {/* Spot Price Line */}
            <path
              d={pricePath}
              fill="none"
              stroke="#60a5fa"
              strokeWidth="2.1"
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Active Trade Entry Barrier */}
            {entrySpotY !== null && activeContract && (
              <g>
                <line
                  x1={padLeft}
                  y1={entrySpotY}
                  x2={padLeft + plotW}
                  y2={entrySpotY}
                  stroke={activeContract.direction === 'CALL' ? '#10b981' : '#ef4444'}
                  strokeWidth="1.4"
                  strokeDasharray="5 3"
                />
                <rect
                  x={padLeft + 6}
                  y={Math.max(padTop, entrySpotY - 18)}
                  width="118"
                  height="16"
                  rx="4"
                  fill={activeContract.direction === 'CALL' ? '#059669' : '#dc2626'}
                />
                <text
                  x={padLeft + 12}
                  y={Math.max(padTop + 11, entrySpotY - 7)}
                  className="fill-white text-[10px] font-mono font-semibold"
                >
                  {activeContract.direction === 'CALL' ? 'RISE' : 'FALL'} @{' '}
                  {formatSpotPrice(activeContract.entrySpot, market.pip)}
                </text>
              </g>
            )}

            {/* Latest Live Price Marker */}
            {latestTick && (
              <g>
                <circle
                  cx={toX(slicedTicks.length - 1, slicedTicks.length)}
                  cy={toY(latestTick.quote)}
                  r="6"
                  fill={isUp ? 'rgba(16, 185, 129, 0.25)' : 'rgba(239, 68, 68, 0.25)'}
                />
                <circle
                  cx={toX(slicedTicks.length - 1, slicedTicks.length)}
                  cy={toY(latestTick.quote)}
                  r="3.2"
                  fill={isUp ? '#10b981' : '#ef4444'}
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
              </g>
            )}

            {/* Crosshair Hover */}
            {inspectedTick && inspectedIdx !== null && (
              <g>
                <line
                  x1={toX(inspectedIdx, slicedTicks.length)}
                  y1={padTop}
                  x2={toX(inspectedIdx, slicedTicks.length)}
                  y2={padTop + plotH}
                  stroke="#475569"
                  strokeWidth="1"
                  strokeDasharray="2 2"
                />
                <circle
                  cx={toX(inspectedIdx, slicedTicks.length)}
                  cy={toY(inspectedTick.quote)}
                  r="4"
                  fill="#60a5fa"
                  stroke="#0f172a"
                  strokeWidth="1.5"
                />
              </g>
            )}

            {/* X-axis timestamps */}
            {slicedTicks.length >= 4 &&
              [0, Math.floor(slicedTicks.length / 2), slicedTicks.length - 1].map((idx) => (
                <text
                  key={idx}
                  x={toX(idx, slicedTicks.length)}
                  y={height - 4}
                  textAnchor={idx === 0 ? 'start' : idx === slicedTicks.length - 1 ? 'end' : 'middle'}
                  className="fill-slate-500 text-[10px] font-mono"
                >
                  {new Date(slicedTicks[idx].epoch * 1000).toLocaleTimeString()}
                </text>
              ))}
          </svg>
        </div>
      )}
    </div>
  );
};
