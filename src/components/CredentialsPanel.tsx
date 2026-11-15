import React, { useState } from 'react';
import type { ConnectionPhase, DerivAccountInfo } from '../types/deriv';
import { Eye, EyeOff, KeyRound, ShieldCheck, AlertTriangle, LogOut, Lock } from 'lucide-react';

interface CredentialsPanelProps {
  appIdMasked: string;
  hasToken: boolean;
  isLocked: boolean;
  connectionPhase: ConnectionPhase;
  account: DerivAccountInfo | null;
  authError: string | null;
  onConnectAndAuthorize: (appId: string, token: string) => void;
  onDisconnectAuth: () => void;
}

export const CredentialsPanel: React.FC<CredentialsPanelProps> = ({
  appIdMasked,
  hasToken,
  isLocked,
  connectionPhase,
  account,
  authError,
  onConnectAndAuthorize,
  onDisconnectAuth,
}) => {
  const [draftAppId, setDraftAppId] = useState('');
  const [draftToken, setDraftToken] = useState('');
  const [showToken, setShowToken] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked) return;
    onConnectAndAuthorize(draftAppId.trim(), draftToken.trim());
  };

  const isAuthorizing = connectionPhase === 'authorizing' || connectionPhase === 'connecting';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-7 terminal-card-blue rounded-xl p-5 sm:p-6">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-bold text-slate-100">
                Deriv API &amp; Server Persistence
              </h2>
              {isLocked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-[11px] font-medium text-amber-300">
                  <Lock className="h-3 w-3" />
                  PIN Locked
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Saved securely on the backend runner so execution continues even when your phone sleeps
            </p>
          </div>
          <KeyRound className="h-5 w-5 text-blue-400 shrink-0" />
        </div>

        {hasToken && appIdMasked && (
          <div className="mt-4 px-3.5 py-2.5 rounded-lg bg-[#0F172A] border border-emerald-500/30 text-xs flex items-center justify-between gap-2">
            <span className="text-slate-300">
              Active saved App ID: <span className="font-mono font-semibold text-emerald-400">{appIdMasked}</span>
            </span>
            <span className="font-mono text-[11px] text-slate-400">Token stored on server</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Deriv App ID
            </label>
            <input
              type="text"
              disabled={isLocked}
              value={draftAppId}
              onChange={(e) => setDraftAppId(e.target.value)}
              placeholder={appIdMasked ? `Saved (${appIdMasked}) — enter new ID to replace` : 'Paste your Deriv App ID'}
              required
              className="w-full px-3.5 py-2.5 text-sm font-mono bg-[#0F172A] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Deriv API / Personal Access Token (PAT)
            </label>
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                disabled={isLocked}
                value={draftToken}
                onChange={(e) => setDraftToken(e.target.value)}
                placeholder={hasToken ? '•••••••••••••••• (enter new token to replace)' : 'Paste your pat_... token or Deriv API token'}
                required
                className="w-full pl-3.5 pr-10 py-2.5 text-sm font-mono bg-[#0F172A] border border-slate-700/80 rounded-lg text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                aria-label={showToken ? 'Hide API token' : 'Show API token'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-200"
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {authError && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-300">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={isAuthorizing || isLocked}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthorizing ? 'Authorizing...' : 'Connect & Save on Server'}
            </button>

            {account && (
              <button
                type="button"
                disabled={isLocked}
                onClick={onDisconnectAuth}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-300 bg-[#0F172A] border border-slate-700/80 hover:bg-slate-800 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <LogOut className="h-4 w-4" />
                <span>Clear Authorization</span>
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Account Verification & Persistence Notes */}
      <div className="lg:col-span-5 space-y-5">
        <div
          className={`${
            account ? (account.isVirtual ? 'terminal-card-emerald' : 'terminal-card-crimson') : 'terminal-card'
          } rounded-xl p-5 sm:p-6`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <h3 className="text-sm font-bold text-slate-100">Authorized Account Status</h3>
            <ShieldCheck
              className={`h-5 w-5 ${
                account ? (account.isVirtual ? 'text-emerald-400' : 'text-red-400') : 'text-slate-500'
              }`}
            />
          </div>

          {account ? (
            <dl className="mt-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Account ID</dt>
                <dd className="font-mono font-semibold text-slate-100">{account.loginid}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Environment</dt>
                <dd
                  className={`font-semibold ${
                    account.isVirtual ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {account.isVirtual ? 'DEMO (Virtual Funds)' : 'REAL ACCOUNT'}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Live Balance</dt>
                <dd className="font-mono font-bold text-sm text-slate-100 tabular-nums">
                  {account.balance.toFixed(2)} {account.currency}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Profile</dt>
                <dd className="text-slate-200">{account.fullname || account.email || 'Deriv Trader'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-400">Token Scopes</dt>
                <dd className="font-mono text-slate-300">{account.scopes.join(', ') || 'read, trade'}</dd>
              </div>
            </dl>
          ) : (
            <div className="mt-4 text-xs text-slate-400 space-y-2">
              <p>
                Streaming live public market ticks in <strong className="text-slate-200">Observer Mode</strong>.
              </p>
              <p>
                Authorize your Deriv App ID and Token to run persistent 24/7 execution on the backend runner.
              </p>
            </div>
          )}
        </div>

        <div className="terminal-card rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 mb-2">
            24/7 Persistence Architecture
          </h3>
          <ol className="text-xs text-slate-400 space-y-2 list-decimal pl-4">
            <li>
              <strong className="text-slate-200">Server-Side Execution:</strong> Agents crawl and place orders directly from the Node backend, surviving mobile screen sleep or browser reloads.
            </li>
            <li>
              <strong className="text-slate-200">Auto-Reconnect:</strong> WebSocket disconnects trigger exponential backoff reconnection without resetting agent state.
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
};
