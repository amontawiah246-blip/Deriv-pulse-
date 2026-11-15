import type { MarketCategory, MarketDefinition } from '../types/deriv.ts';

export const MARKET_CATEGORIES: { id: 'all' | MarketCategory; label: string }[] = [
  { id: 'all', label: 'All Markets' },
  { id: 'volatility_1s', label: 'Volatility (1s)' },
  { id: 'volatility_2s', label: 'Volatility (2s)' },
  { id: 'jump', label: 'Jump Indices' },
  { id: 'daily_reset', label: 'Daily Reset' },
  { id: 'step', label: 'Step Indices' },
  { id: 'crash_boom', label: 'Crash & Boom' },
  { id: 'range_dex', label: 'Range & Drift' },
  { id: 'forex_major', label: 'Forex Majors' },
  { id: 'forex_cross', label: 'Forex Crosses' },
  { id: 'metals', label: 'Metals' },
];

export const CURATED_DERIV_MARKETS: MarketDefinition[] = [
  // Volatility (1s) Indices — ultra-fast 1-second tick frequency
  { symbol: '1HZ10V', displayName: 'Volatility 10 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ15V', displayName: 'Volatility 15 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ25V', displayName: 'Volatility 25 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ30V', displayName: 'Volatility 30 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ50V', displayName: 'Volatility 50 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ75V', displayName: 'Volatility 75 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ90V', displayName: 'Volatility 90 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ100V', displayName: 'Volatility 100 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ150V', displayName: 'Volatility 150 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: '1HZ250V', displayName: 'Volatility 250 (1s) Index', category: 'volatility_1s', categoryLabel: 'Volatility (1s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Volatility (2s) Indices
  { symbol: 'R_10', displayName: 'Volatility 10 Index', category: 'volatility_2s', categoryLabel: 'Volatility (2s)', pip: 0.001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'R_25', displayName: 'Volatility 25 Index', category: 'volatility_2s', categoryLabel: 'Volatility (2s)', pip: 0.001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'R_50', displayName: 'Volatility 50 Index', category: 'volatility_2s', categoryLabel: 'Volatility (2s)', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'R_75', displayName: 'Volatility 75 Index', category: 'volatility_2s', categoryLabel: 'Volatility (2s)', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'R_100', displayName: 'Volatility 100 Index', category: 'volatility_2s', categoryLabel: 'Volatility (2s)', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Jump Indices
  { symbol: 'JD10', displayName: 'Jump 10 Index', category: 'jump', categoryLabel: 'Jump Indices', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'JD25', displayName: 'Jump 25 Index', category: 'jump', categoryLabel: 'Jump Indices', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'JD50', displayName: 'Jump 50 Index', category: 'jump', categoryLabel: 'Jump Indices', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'JD75', displayName: 'Jump 75 Index', category: 'jump', categoryLabel: 'Jump Indices', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'JD100', displayName: 'Jump 100 Index', category: 'jump', categoryLabel: 'Jump Indices', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Daily Reset Indices
  { symbol: 'RDBULL', displayName: 'Bull Market Index', category: 'daily_reset', categoryLabel: 'Daily Reset', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'RDBEAR', displayName: 'Bear Market Index', category: 'daily_reset', categoryLabel: 'Daily Reset', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Step Indices
  { symbol: 'stpRNG', displayName: 'Step Index 100', category: 'step', categoryLabel: 'Step Indices', pip: 0.1, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'stpRNG2', displayName: 'Step Index 200', category: 'step', categoryLabel: 'Step Indices', pip: 0.1, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'stpRNG3', displayName: 'Step Index 300', category: 'step', categoryLabel: 'Step Indices', pip: 0.1, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'stpRNG4', displayName: 'Step Index 400', category: 'step', categoryLabel: 'Step Indices', pip: 0.1, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'stpRNG5', displayName: 'Step Index 500', category: 'step', categoryLabel: 'Step Indices', pip: 0.1, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Crash & Boom Indices
  { symbol: 'BOOM300N', displayName: 'Boom 300 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'BOOM500', displayName: 'Boom 500 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'BOOM600', displayName: 'Boom 600 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'BOOM900', displayName: 'Boom 900 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'BOOM1000', displayName: 'Boom 1000 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'CRASH300N', displayName: 'Crash 300 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'CRASH500', displayName: 'Crash 500 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'CRASH600', displayName: 'Crash 600 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'CRASH900', displayName: 'Crash 900 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'CRASH1000', displayName: 'Crash 1000 Index', category: 'crash_boom', categoryLabel: 'Crash & Boom', pip: 0.0001, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Range Break & Drift Switch Indices
  { symbol: 'RB100', displayName: 'Range Break 100 Index', category: 'range_dex', categoryLabel: 'Range & Drift', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'RB200', displayName: 'Range Break 200 Index', category: 'range_dex', categoryLabel: 'Range & Drift', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'DSH10', displayName: 'Drift Switch 10 Index', category: 'range_dex', categoryLabel: 'Range & Drift', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'DSH20', displayName: 'Drift Switch 20 Index', category: 'range_dex', categoryLabel: 'Range & Drift', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },
  { symbol: 'DSH30', displayName: 'Drift Switch 30 Index', category: 'range_dex', categoryLabel: 'Range & Drift', pip: 0.01, isSynthetic: true, defaultDuration: 5, defaultDurationUnit: 't', riseFallSupported: null },

  // Forex Majors
  { symbol: 'frxEURUSD', displayName: 'EUR/USD', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxGBPUSD', displayName: 'GBP/USD', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxUSDJPY', displayName: 'USD/JPY', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.01, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxAUDUSD', displayName: 'AUD/USD', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxUSDCAD', displayName: 'USD/CAD', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxUSDCHF', displayName: 'USD/CHF', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxNZDUSD', displayName: 'NZD/USD', category: 'forex_major', categoryLabel: 'Forex Majors', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },

  // Forex Crosses
  { symbol: 'frxEURGBP', displayName: 'EUR/GBP', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxEURJPY', displayName: 'EUR/JPY', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.01, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxGBPJPY', displayName: 'GBP/JPY', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.01, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxEURAUD', displayName: 'EUR/AUD', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxAUDJPY', displayName: 'AUD/JPY', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.01, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxGBPAUD', displayName: 'GBP/AUD', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxEURCAD', displayName: 'EUR/CAD', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxAUDCAD', displayName: 'AUD/CAD', category: 'forex_cross', categoryLabel: 'Forex Crosses', pip: 0.0001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },

  // Metals
  { symbol: 'frxXAUUSD', displayName: 'Gold / USD (XAU/USD)', category: 'metals', categoryLabel: 'Metals', pip: 0.01, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
  { symbol: 'frxXAGUSD', displayName: 'Silver / USD (XAG/USD)', category: 'metals', categoryLabel: 'Metals', pip: 0.001, isSynthetic: false, defaultDuration: 15, defaultDurationUnit: 'm', riseFallSupported: null },
];

export interface DerivActiveSymbolRaw {
  symbol?: string;
  underlying_symbol?: string;
  display_name?: string;
  underlying_symbol_name?: string;
  market: string;
  market_display_name?: string;
  submarket: string;
  submarket_display_name?: string;
  exchange_is_open: number;
  is_trading_suspended?: number;
  pip?: number;
  pip_size?: number;
}

function classifyDerivActiveSymbol(raw: DerivActiveSymbolRaw): {
  category: MarketCategory;
  categoryLabel: string;
  isSynthetic: boolean;
} {
  const sym = (raw.underlying_symbol || raw.symbol || '').toUpperCase();
  const sub = (raw.submarket || '').toLowerCase();
  const mkt = (raw.market || '').toLowerCase();

  if (mkt === 'synthetic_index' || mkt === 'derived') {
    if (sym.startsWith('1HZ')) return { category: 'volatility_1s', categoryLabel: 'Volatility (1s)', isSynthetic: true };
    if (sym.startsWith('R_')) return { category: 'volatility_2s', categoryLabel: 'Volatility (2s)', isSynthetic: true };
    if (sym.startsWith('JD')) return { category: 'jump', categoryLabel: 'Jump Indices', isSynthetic: true };
    if (sym.startsWith('RD')) return { category: 'daily_reset', categoryLabel: 'Daily Reset', isSynthetic: true };
    if (sym.startsWith('STP')) return { category: 'step', categoryLabel: 'Step Indices', isSynthetic: true };
    if (sym.startsWith('BOOM') || sym.startsWith('CRASH')) {
      return { category: 'crash_boom', categoryLabel: 'Crash & Boom', isSynthetic: true };
    }
    return { category: 'range_dex', categoryLabel: raw.submarket_display_name || 'Derived Index', isSynthetic: true };
  }

  if (sub.includes('metal') || sym.includes('XAU') || sym.includes('XAG') || sym.includes('XPT') || sym.includes('XPD')) {
    return { category: 'metals', categoryLabel: 'Metals', isSynthetic: false };
  }

  if (sub.includes('major')) {
    return { category: 'forex_major', categoryLabel: 'Forex Majors', isSynthetic: false };
  }

  return { category: 'forex_cross', categoryLabel: 'Forex Crosses', isSynthetic: false };
}

export function mergeWithLiveActiveSymbols(liveSymbols: DerivActiveSymbolRaw[]): MarketDefinition[] {
  const map = new Map<string, MarketDefinition>();

  for (const curated of CURATED_DERIV_MARKETS) {
    map.set(curated.symbol, { ...curated });
  }

  for (const raw of liveSymbols) {
    const symCode = raw.underlying_symbol || raw.symbol;
    if (!symCode) continue;

    const mkt = (raw.market || '').toLowerCase();
    // Include all synthetic/derived indices and forex/commodities metals
    if (mkt !== 'synthetic_index' && mkt !== 'derived' && mkt !== 'forex' && mkt !== 'commodities') {
      continue;
    }

    const displayName = raw.underlying_symbol_name || raw.display_name || symCode;
    const pip = raw.pip_size ?? raw.pip ?? 0.001;
    const isOpen = raw.exchange_is_open === 1 && raw.is_trading_suspended !== 1;

    const existing = map.get(symCode);
    if (existing) {
      existing.displayName = displayName;
      existing.pip = pip;
      existing.exchangeIsOpen = isOpen;
    } else {
      const classified = classifyDerivActiveSymbol(raw);
      map.set(symCode, {
        symbol: symCode,
        displayName,
        category: classified.category,
        categoryLabel: classified.categoryLabel,
        pip,
        isSynthetic: classified.isSynthetic,
        defaultDuration: classified.isSynthetic ? 5 : 15,
        defaultDurationUnit: classified.isSynthetic ? 't' : 'm',
        exchangeIsOpen: isOpen,
        riseFallSupported: null,
      });
    }
  }

  return Array.from(map.values());
}

export function formatSpotPrice(price: number | null, pip: number): string {
  if (price === null || Number.isNaN(price)) return '—';
  const decimals = Math.max(0, Math.min(6, Math.round(-Math.log10(pip || 0.01))));
  return price.toFixed(decimals);
}
