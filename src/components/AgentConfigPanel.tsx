import React, { useEffect, useState } from 'react';
import type { AgentConfig, SettingsLockState } from '../types/deriv';
import { KeyRound, Lock, RotateCcw, ShieldCheck, Unlock } from 'lucide-react';

interface AgentConfigPanelProps {
  config: AgentConfig;
  currency: string;
  accountBalance?: number;
  martingaleStep: number;
  currentNextStake: number;
  lastLossSymbol: string | null;
  lock: SettingsLockState;
  onChange: (next: AgentConfig) => void;
  onResetMartingale: () => void;
  onLockWithPin: (pin?: string) => Promise<void>;
  onUnlockWithPin: (pin: string) => Promise<void>;
  onClearPin: (pin: string) => Promise<void>;
}

export const AgentConfigPanel: React.FC<AgentConfigPanelProps> = ({
  config,
  currency,
  accountBalance,
  martingaleStep,
  currentNextStake,
  lastLossSymbol,
  lock,
  onChange,
  onResetMartingale,
  onLockWithPin,
  onUnlockWithPin,
  onClearPin,
}) => {
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);
  const [baseStakeDraft, setBaseStakeDraft] = useState<string>(String(config.baseStake));
  const [isEditingStake, setIsEditingStake] = useState(false);

  useEffect(() => {
    if (!isEditingStake) {
      setBaseStakeDraft(String(config.baseStake));
    }
  }, [config.baseStake, isEditingStake]);

  const isLocked = lock.isLocked;

  const update = <K extends keyof AgentConfig>(key: K, val: AgentConfig[K]) => {
    if (isLocked) return;
    onChange({ ...config, [key]: val });
  };

  // Calculate exact Martingale ladder preview (respecting Bankroll Risk Guard)
  let chainFactor = 0;
  for (let s = 0; s <= config.maxMartingaleSteps; s++) {
    chainFactor += Math.pow(config.martingaleMultiplier, s);
  }
  const safeBaseCap =
    accountBalance && accountBalance >= 0.35
      ? Math.max(
          0.35,
          Math.floor(
            ((accountBalance * (Math.max(1, Math.min(25, config.maxCycleRiskPct)) / 100)) /
              Math.max(1, chainFactor)) *
              100
          ) / 100
        )
      : config.baseStake;
  const effectiveBase =
    config.bankrollRiskGuard && accountBalance && accountBalance >= 0.35
      ? Math.min(config.baseStake, safeBaseCap)
      : config.baseStake;
  const totalChainCost = Number((effectiveBase * chainFactor).toFixed(2));

  const effectiveCap = Math.max(effectiveBase, config.maxStakeCap);
  const ladder: number[] = [];
  for (let s = 0; s <= Math.min(config.maxMartingaleSteps, 5); s++) {
    const raw = effectiveBase * Math.pow(config.martingaleMultiplier, s);
    ladder.push(
      s === 0
        ? Number(Math.max(0.35, effectiveBase).toFixed(2))
        : Number(Math.min(effectiveCap, Math.max(0.35, raw)).toFixed(2))
    );
  }

  const handleLock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinBusy(true);
    try {
      await onLockWithPin(pinInput.trim() || undefined);
      setPinInput('');
    } catch (err: any) {
      setPinError(err?.message || 'Failed to lock settings');
    } finally {
      setPinBusy(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    setPinBusy(true);
    try {
      await onUnlockWithPin(pinInput.trim());
      setPinInput('');
    } catch (err: any) {
      setPinError(err?.message || 'Incorrect Operator PIN');
    } finally {
      setPinBusy(false);
    }
  };

  const handleQuickLock = async () => {
    setPinError(null);
    setPinBusy(true);
    try {
      await onLockWithPin();
    } catch (err: any) {
      setPinError(err?.message || 'Failed to lock settings');
    } finally {
      setPinBusy(false);
    }
  };

  const handleClearPin = async () => {
    setPinError(null);
    setPinBusy(true);
    try {
      await onClearPin(pinInput.trim());
      setPinInput('');
    } catch (err: any) {
      setPinError(err?.message || 'Incorrect current PIN');
    } finally {
      setPinBusy(false);
    }
  };

  const inputClass =
    'mt-1 w-full px-3 py-2 text-sm font-mono bg-[#0F172A] border border-slate-700/80 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="space-y-5">
      {/* Operator PIN Lock Security Card */}
      <div
        className={`rounded-xl p-4 sm:p-5 border ${
          isLocked
            ? 'bg-amber-500/5 border-amber-500/30'
            : 'bg-[#0F172A] border-slate-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isLocked ? (
              <Lock className="h-4 w-4 text-amber-400 shrink-0" />
            ) : (
              <Unlock className="h-4 w-4 text-emerald-400 shrink-0" />
            )}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-100">
                Operator PIN Lock {isLocked ? '· ACTIVE (READ-ONLY)' : lock.hasPin ? '· UNLOCKED' : '· UNPROTECTED'}
              </h4>
              <p className="text-xs text-slate-400 mt-0.5">
                {isLocked
                  ? 'Stakes, rules, and credentials are locked on the server. Enter your PIN to edit.'
                  : 'Set a 4+ digit Operator PIN so only you can change stake amounts, Martingale rules, or API tokens.'}
              </p>
            </div>
          </div>

          {lock.hasPin && !isLocked && (
            <button
              type="button"
              disabled={pinBusy}
              onClick={() => void handleQuickLock()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/35 hover:bg-amber-500/25 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Lock className="h-3.5 w-3.5" />
              <span>Re-Lock Now</span>
            </button>
          )}
        </div>

        <form
          onSubmit={isLocked ? handleUnlock : handleLock}
          className="mt-3 flex flex-wrap items-center gap-2.5"
        >
          <div className="relative flex-1 min-w-[180px]">
            <KeyRound className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="password"
              inputMode="numeric"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder={
                isLocked
                  ? 'Enter Operator PIN to unlock...'
                  : lock.hasPin
                  ? 'Enter current PIN to remove, or new PIN...'
                  : 'Create 4+ digit Operator PIN...'
              }
              className="w-full pl-9 pr-3 py-2 text-xs font-mono bg-[#131C2E] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500"
            />
          </div>

          {isLocked ? (
            <button
              type="submit"
              disabled={pinBusy || !pinInput.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span>Unlock Settings</span>
            </button>
          ) : (
            <>
              <button
                type="submit"
                disabled={pinBusy || (!lock.hasPin && pinInput.trim().length < 4)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{lock.hasPin && pinInput.trim().length < 4 ? 'Lock Settings' : 'Set PIN & Lock'}</span>
              </button>
              {lock.hasPin && (
                <button
                  type="button"
                  disabled={pinBusy || !pinInput.trim()}
                  onClick={() => void handleClearPin()}
                  className="px-3 py-2 text-xs font-medium text-red-300 bg-red-500/10 border border-red-500/25 hover:bg-red-500/20 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  Remove PIN
                </button>
              )}
            </>
          )}
        </form>

        {pinError && (
          <p className="mt-2 text-xs text-red-400 font-medium">{pinError}</p>
        )}
      </div>

      {/* Main Parameters Card */}
      <div className="terminal-card rounded-xl p-5 sm:p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-bold text-slate-100">
              Execution &amp; Martingale Parameters
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Next scheduled stake:{' '}
              <span className="font-mono font-semibold text-slate-100">
                {currentNextStake.toFixed(2)} {currency}
              </span>{' '}
              (Step {martingaleStep}/{config.maxMartingaleSteps})
              {martingaleStep > 0 && lastLossSymbol && config.crossPairMartingale
                ? ` · Excluding ${lastLossSymbol} for cross-pair recovery`
                : ''}
            </p>
          </div>

          <button
            type="button"
            disabled={isLocked}
            onClick={onResetMartingale}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0F172A] border border-slate-700/80 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Reset Step</span>
          </button>
        </div>

        {/* Martingale Stake Ladder */}
        <div className="rounded-lg bg-[#0F172A] border border-slate-800 p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="text-[11px] uppercase tracking-wider font-medium text-slate-400">
              Active Martingale Progression Ladder ({currency})
            </div>
            <span className="text-[11px] font-mono text-slate-400 tabular-nums">
              Full chain risk: <strong className="text-slate-200">{totalChainCost.toFixed(2)} {currency}</strong>
              {config.bankrollRiskGuard && effectiveBase < config.baseStake
                ? ` · Clamped base ${effectiveBase.toFixed(2)} ${currency}`
                : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {ladder.map((amt, idx) => (
              <div
                key={idx}
                className={`px-2.5 py-1 rounded-md border tabular-nums ${
                  idx === martingaleStep
                    ? 'bg-blue-600 text-white border-blue-500 font-semibold'
                    : 'bg-[#131C2E] text-slate-300 border-slate-700/70'
                }`}
              >
                S{idx}: {amt.toFixed(2)}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            At ~50% random-walk odds (~51.2% Deriv payout breakeven), a {config.maxMartingaleSteps + 1}-loss streak hits ~1 in{' '}
            {Math.pow(2, config.maxMartingaleSteps + 1)} cycles (
            {(100 / Math.pow(2, config.maxMartingaleSteps + 1)).toFixed(1)}% full-chain loss odds per cycle).
          </p>
        </div>

        {/* Numeric Controls Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-400">Base Stake ({currency})</span>
            <input
              type="number"
              min="0.35"
              step="any"
              disabled={isLocked}
              value={baseStakeDraft}
              onFocus={() => setIsEditingStake(true)}
              onBlur={() => {
                setIsEditingStake(false);
                const parsed = parseFloat(baseStakeDraft);
                const normalized = Number.isFinite(parsed) && parsed >= 0.35 ? parsed : config.baseStake;
                setBaseStakeDraft(String(normalized));
                if (!isLocked && normalized !== config.baseStake) {
                  onChange({
                    ...config,
                    baseStake: normalized,
                    maxStakeCap: Math.max(config.maxStakeCap, normalized),
                  });
                }
              }}
              onChange={(e) => {
                const rawVal = e.target.value;
                setBaseStakeDraft(rawVal);
                const parsed = parseFloat(rawVal);
                if (!isLocked && Number.isFinite(parsed) && parsed >= 0.35) {
                  onChange({
                    ...config,
                    baseStake: parsed,
                    maxStakeCap: Math.max(config.maxStakeCap, parsed),
                  });
                }
              }}
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Martingale Multiplier</span>
            <input
              type="number"
              min="1.1"
              max="4"
              step="0.05"
              disabled={isLocked}
              value={config.martingaleMultiplier}
              onChange={(e) =>
                update('martingaleMultiplier', Math.max(1.1, Math.min(4, Number(e.target.value) || 2.1)))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Max Martingale Steps</span>
            <input
              type="number"
              min="0"
              max="8"
              step="1"
              disabled={isLocked}
              value={config.maxMartingaleSteps}
              onChange={(e) =>
                update('maxMartingaleSteps', Math.max(0, Math.min(8, Math.floor(Number(e.target.value) || 0))))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Max Stake Cap ({currency})</span>
            <input
              type="number"
              min="1"
              step="5"
              disabled={isLocked}
              value={config.maxStakeCap}
              onChange={(e) => update('maxStakeCap', Math.max(1, Number(e.target.value) || 50))}
              className={inputClass}
            />
          </label>

          <div className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Take-Profit Target ({currency})</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={config.enableTakeProfit}
                  onChange={(e) => update('enableTakeProfit', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-[#0F172A] text-blue-600"
                />
                <span>{config.enableTakeProfit ? 'Enabled' : 'Unlimited'}</span>
              </label>
            </div>
            <input
              type="number"
              min="1"
              step="10"
              disabled={isLocked || !config.enableTakeProfit}
              value={config.takeProfitTarget}
              onChange={(e) => update('takeProfitTarget', Math.max(1, Number(e.target.value) || 2500))}
              className={inputClass}
            />
          </div>

          <div className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Stop-Loss Limit ({currency})</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={config.enableStopLoss}
                  onChange={(e) => update('enableStopLoss', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-[#0F172A] text-blue-600"
                />
                <span>{config.enableStopLoss ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
            <input
              type="number"
              min="1"
              step="5"
              disabled={isLocked || !config.enableStopLoss}
              value={config.stopLossLimit}
              onChange={(e) => update('stopLossLimit', Math.max(1, Number(e.target.value) || 100))}
              className={inputClass}
            />
          </div>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Fast Trade Duration</span>
            <select
              disabled={isLocked}
              value={config.durationMode}
              onChange={(e) => update('durationMode', e.target.value as AgentConfig['durationMode'])}
              className={inputClass}
            >
              <option value="fastest">Fastest Valid (Market Min)</option>
              <option value="5t">5 Ticks (~5–10 sec)</option>
              <option value="10t">10 Ticks (~10–20 sec)</option>
              <option value="15s">15 Seconds</option>
              <option value="30s">30 Seconds</option>
              <option value="60s">60 Seconds</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Strategy Engine Mode</span>
            <select
              disabled={isLocked}
              value={config.strategyMode || 'strict_edge'}
              onChange={(e) =>
                update('strategyMode', e.target.value as AgentConfig['strategyMode'])
              }
              className={inputClass}
            >
              <option value="strict_edge">Strict Edge (Hold RNG Coin-Flips)</option>
              <option value="forex_mean_reversion">Forex 5m Z&gt;=2.3 Mean-Rev (Mon–Fri)</option>
              <option value="dual_ema_rule">Dual-EMA 9/21 Breakout (User Rule)</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Min Empirical Win Rate (%)</span>
            <input
              type="number"
              min="50"
              max="75"
              step="1"
              disabled={isLocked}
              value={config.minConfidence}
              onChange={(e) =>
                update('minConfidence', Math.max(50, Math.min(75, Number(e.target.value) || 54)))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Trend Efficiency Ref (ER)</span>
            <input
              type="number"
              min="0.05"
              max="0.55"
              step="0.02"
              disabled={isLocked}
              value={config.minKaufmanER}
              onChange={(e) =>
                update('minKaufmanER', Math.max(0.05, Math.min(0.55, Number(e.target.value) || 0.20)))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Cooldown Between Trades (sec)</span>
            <input
              type="number"
              min="0"
              max="30"
              step="1"
              disabled={isLocked}
              value={config.cooldownSeconds}
              onChange={(e) =>
                update('cooldownSeconds', Math.max(0, Math.min(30, Number(e.target.value) || 0)))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Losing Pair Cooldown (sec)</span>
            <input
              type="number"
              min="0"
              max="300"
              step="5"
              disabled={isLocked}
              value={config.lossCooldownSeconds}
              onChange={(e) =>
                update('lossCooldownSeconds', Math.max(0, Math.min(300, Number(e.target.value) || 0)))
              }
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Market Scope</span>
            <select
              disabled={isLocked}
              value={config.marketScope}
              onChange={(e) => update('marketScope', e.target.value as AgentConfig['marketScope'])}
              className={inputClass}
            >
              <option value="all">All Rise/Fall Markets</option>
              <option value="synthetics">Synthetics Only</option>
              <option value="forex">Forex &amp; Metals Only</option>
              <option value="pinned">Pinned Active Symbol Only</option>
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-medium text-slate-400">Strategy Engine Mode</span>
            <select
              disabled={isLocked}
              value={config.strategyMode || 'strict_edge'}
              onChange={(e) => update('strategyMode', e.target.value as AgentConfig['strategyMode'])}
              className={inputClass}
            >
              <option value="strict_edge">Strict Statistical Edge (Ljung-Box p&lt;0.01)</option>
              <option value="forex_mean_reversion">Forex 5m Z-Fade (|Z|&gt;=2.30, 54.2% WR)</option>
              <option value="dual_ema_rule">Dual-EMA 9/21 Unfiltered Rule (User)</option>
            </select>
          </label>
          <div className="block">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">Auto-Clamp Stake (% Bal)</span>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  disabled={isLocked}
                  checked={config.bankrollRiskGuard}
                  onChange={(e) => update('bankrollRiskGuard', e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-600 bg-[#0F172A] text-blue-600"
                />
                <span>{config.bankrollRiskGuard ? 'Clamping ON' : 'OFF (Exact Stake)'}</span>
              </label>
            </div>
            <input
              type="number"
              min="1"
              max="25"
              step="1"
              disabled={isLocked || !config.bankrollRiskGuard}
              value={config.maxCycleRiskPct}
              onChange={(e) =>
                update('maxCycleRiskPct', Math.max(1, Math.min(25, Number(e.target.value) || 5)))
              }
              className={inputClass}
            />
          </div>
        </div>

        {/* Strategy Toggles */}
        <div className="flex flex-wrap items-center gap-5 pt-4 border-t border-slate-800/80">
          <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              disabled={isLocked}
              checked={config.crossPairMartingale}
              onChange={(e) => update('crossPairMartingale', e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-[#0F172A] text-blue-600"
            />
            <span>Cross-Pair Martingale (never recover on same losing pair)</span>
          </label>

          <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              disabled={isLocked}
              checked={config.skipJumpIndices}
              onChange={(e) => update('skipJumpIndices', e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-[#0F172A] text-blue-600"
            />
            <span>Exclude Jump Indices (avoid sudden 30σ jump spikes)</span>
          </label>

          <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              disabled={isLocked}
              checked={config.autoSwitchMarket}
              onChange={(e) => update('autoSwitchMarket', e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-[#0F172A] text-blue-600"
            />
            <span>Auto-switch to highest confluence setup</span>
          </label>

          <label className="inline-flex items-center gap-2.5 cursor-pointer text-xs font-medium text-slate-300">
            <input
              type="checkbox"
              disabled={isLocked}
              checked={config.demoOnlyLock}
              onChange={(e) => update('demoOnlyLock', e.target.checked)}
              className="h-4 w-4 rounded border-slate-600 bg-[#0F172A] text-blue-600"
            />
            <span>Demo Account Safety Lock (VRTC only)</span>
          </label>
        </div>
      </div>
    </div>
  );
};
