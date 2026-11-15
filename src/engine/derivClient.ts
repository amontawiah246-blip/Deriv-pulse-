import type { DerivActiveSymbolRaw } from '../data/markets.ts';
import type {
  ActiveContractState,
  CandlePoint,
  DerivAccountInfo,
  DurationUnit,
  TickPoint,
  TradeDirection,
} from '../types/deriv.ts';

export interface DurationSpec {
  value: number;
  unit: DurationUnit;
  label: string;
}

export function parseDerivDuration(raw: string | undefined): DurationSpec {
  if (!raw) return { value: 5, unit: 't', label: '5 ticks' };
  const match = /^(\d+)([tsmhd])$/i.exec(raw.trim());
  if (!match) return { value: 5, unit: 't', label: '5 ticks' };
  const value = parseInt(match[1], 10);
  const unitChar = match[2].toLowerCase();
  const unit: DurationUnit =
    unitChar === 't' ? 't' : unitChar === 's' ? 's' : unitChar === 'm' ? 'm' : 'm';
  const unitLabel =
    unit === 't' ? (value === 1 ? 'tick' : 'ticks') : unit === 's' ? 'sec' : 'min';
  return {
    value: unitChar === 'h' ? value * 60 : unitChar === 'd' ? value * 1440 : value,
    unit,
    label: `${value} ${unitLabel}`,
  };
}

function durationToSecondsApprox(spec: DurationSpec): number {
  if (spec.unit === 't') return spec.value * 1.5;
  if (spec.unit === 's') return spec.value;
  return spec.value * 60;
}

export function resolveValidDuration(
  requestedMode: 'fastest' | '5t' | '10t' | '15s' | '30s' | '60s',
  minRaw?: string,
  symbol?: string
): DurationSpec {
  const minSpec = parseDerivDuration(minRaw);
  const adjustStepParity = (spec: DurationSpec): DurationSpec => {
    // Step Indices move strictly +/-0.1 per tick; even tick durations suffer ~24% tie=loss outcomes,
    // whereas odd tick durations (5t, 7t, 9t) have 0% ties.
    if (symbol?.startsWith('stpRNG') && spec.unit === 't' && spec.value % 2 === 0 && spec.value > 5) {
      const oddVal = spec.value - 1;
      return { value: oddVal, unit: 't', label: `${oddVal} ticks` };
    }
    return spec;
  };

  if (requestedMode === 'fastest') {
    if (minSpec.unit === 't' && minSpec.value < 5) {
      return adjustStepParity({ value: 5, unit: 't', label: '5 ticks' });
    }
    return adjustStepParity(minSpec);
  }

  const reqSpec = parseDerivDuration(requestedMode);
  if (durationToSecondsApprox(reqSpec) < durationToSecondsApprox(minSpec)) {
    return adjustStepParity(minSpec);
  }
  if (minSpec.unit === 'm' && reqSpec.unit !== 'm') {
    return adjustStepParity(minSpec);
  }
  return adjustStepParity(reqSpec);
}

type PendingRequest = {
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export interface DerivClientCallbacks {
  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (message: string) => void;
  onTick?: (symbol: string, tick: TickPoint, pipSize: number) => void;
  onBalance?: (balance: number, currency: string) => void;
  onOpenContractUpdate?: (contract: Partial<ActiveContractState> & { contractId: number }) => void;
}

interface OptionsAccountRaw {
  account_id: string;
  balance: string | number;
  currency: string;
  group?: string;
  status?: string;
  account_type: 'demo' | 'real' | string;
}

export class DerivWSClient {
  private ws: WebSocket | null = null;
  private reqCounter = 1;
  private pending = new Map<number, PendingRequest>();
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private callbacks: DerivClientCallbacks;
  private appId: string = 'public';
  private apiMode: 'options-v1' | 'legacy-v3' = 'options-v1';
  private activeTickSubs = new Map<string, string>(); // symbol -> subscription_id
  private contractSubIds = new Map<number, string>(); // contractId -> subscription_id
  private balanceSubId: string | null = null;

  constructor(callbacks: DerivClientCallbacks) {
    this.callbacks = callbacks;
  }

  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  public getAppId(): string {
    return this.appId;
  }

  public getApiMode(): 'options-v1' | 'legacy-v3' {
    return this.apiMode;
  }

  private openSocket(wsUrl: string): Promise<void> {
    this.disconnect();
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(wsUrl);
      this.ws = socket;

      let settled = false;
      const connectTimeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            socket.close();
          } catch {
            // ignore
          }
          reject(new Error('Deriv WebSocket connection timed out'));
        }
      }, 12000);

      socket.onopen = () => {
        clearTimeout(connectTimeout);
        this.startHeartbeat();
        this.callbacks.onOpen?.();
        if (!settled) {
          settled = true;
          resolve();
        }
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string);
          this.handleMessage(msg);
        } catch {
          // Ignore malformed frame
        }
      };

      socket.onerror = () => {
        const errMsg = 'WebSocket transport error connecting to Deriv';
        this.callbacks.onError?.(errMsg);
        if (!settled) {
          clearTimeout(connectTimeout);
          settled = true;
          reject(new Error(errMsg));
        }
      };

      socket.onclose = (ev) => {
        clearTimeout(connectTimeout);
        this.stopHeartbeat();
        for (const [, req] of this.pending) {
          clearTimeout(req.timer);
          req.reject(new Error('WebSocket closed before response'));
        }
        this.pending.clear();
        this.activeTickSubs.clear();
        this.contractSubIds.clear();
        this.balanceSubId = null;
        this.callbacks.onClose?.(ev.code, ev.reason || 'Connection closed');
      };
    });
  }

  /**
   * Connects to Deriv's public unauthenticated Options WebSocket stream.
   */
  public async connectPublic(): Promise<void> {
    this.appId = 'public';
    this.apiMode = 'options-v1';
    await this.openSocket('wss://api.derivws.com/trading/v1/options/ws/public');
  }

  /**
   * Connects and authorizes using either Deriv's Options API (OTP flow for PAT + App ID)
   * or Legacy WebSocket v3 (numeric App ID + classic API token).
   */
  public async connectAndAuthorize(appId: string, token: string): Promise<DerivAccountInfo> {
    const cleanAppId = appId.trim();
    const cleanToken = token.trim();

    if (!cleanAppId || !cleanToken) {
      throw new Error('Both Deriv App ID and API Token are required');
    }

    const useLegacyV3 = /^\d+$/.test(cleanAppId) && !cleanToken.startsWith('pat_');

    if (useLegacyV3) {
      this.appId = cleanAppId;
      this.apiMode = 'legacy-v3';
      await this.openSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(cleanAppId)}`);
      const res = await this.request({ authorize: cleanToken });
      const a = res.authorize;
      if (!this.balanceSubId) {
        this.request({ balance: 1, subscribe: 1 }).catch(() => {});
      }
      return {
        loginid: a.loginid,
        email: a.email || '',
        fullname: a.fullname || '',
        balance: Number(a.balance),
        currency: a.currency || 'USD',
        isVirtual: a.is_virtual === 1,
        scopes: Array.isArray(a.scopes) ? a.scopes : ['read', 'trade'],
      };
    }

    // Modern Deriv Options API (REST Accounts + OTP -> Authenticated WebSocket)
    this.appId = cleanAppId;
    this.apiMode = 'options-v1';

    const headers: Record<string, string> = {
      Authorization: `Bearer ${cleanToken}`,
      'Deriv-App-ID': cleanAppId,
      'Content-Type': 'application/json',
    };

    const acctRes = await fetch('https://api.derivws.com/trading/v1/options/accounts', {
      method: 'GET',
      headers,
    });

    if (!acctRes.ok) {
      let detail = `HTTP ${acctRes.status}`;
      try {
        const errBody = await acctRes.json();
        detail = errBody?.message || errBody?.error?.message || JSON.stringify(errBody);
      } catch {
        // ignore
      }
      throw new Error(`Deriv authorization failed (${detail}). Verify your App ID and PAT Token.`);
    }

    const acctJson = await acctRes.json();
    const accounts: OptionsAccountRaw[] = Array.isArray(acctJson?.data) ? acctJson.data : [];
    if (accounts.length === 0) {
      throw new Error('No Deriv Options accounts found for this token.');
    }

    // Prefer active demo account first for safety
    const chosen =
      accounts.find((a) => a.account_type === 'demo' && a.status === 'active') ||
      accounts.find((a) => a.account_type === 'demo') ||
      accounts[0];

    const otpRes = await fetch(
      `https://api.derivws.com/trading/v1/options/accounts/${encodeURIComponent(chosen.account_id)}/otp`,
      {
        method: 'POST',
        headers,
        body: '{}',
      }
    );

    if (!otpRes.ok) {
      let detail = `HTTP ${otpRes.status}`;
      try {
        const errBody = await otpRes.json();
        detail = errBody?.message || errBody?.error?.message || detail;
      } catch {
        // ignore
      }
      throw new Error(`Failed to obtain Deriv WebSocket OTP (${detail})`);
    }

    const otpJson = await otpRes.json();
    const wsUrl = otpJson?.data?.url as string | undefined;
    if (!wsUrl) {
      throw new Error('Deriv OTP endpoint did not return a WebSocket URL');
    }

    await this.openSocket(wsUrl);

    // Subscribe to live balance updates
    try {
      const balRes = await this.request({ balance: 1, subscribe: 1 }, 8000);
      if (balRes?.balance?.balance !== undefined) {
        chosen.balance = balRes.balance.balance;
        chosen.currency = balRes.balance.currency || chosen.currency;
      }
    } catch {
      // Non-fatal if balance sub takes a moment
    }

    return {
      loginid: chosen.account_id,
      email: '',
      fullname: `Deriv ${chosen.account_type === 'demo' ? 'Demo' : 'Real'} Options`,
      balance: Number(chosen.balance),
      currency: chosen.currency || 'USD',
      isVirtual: chosen.account_type === 'demo',
      scopes: ['read', 'trade'],
    };
  }

  public disconnect(): void {
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        // Ignore close error
      }
      this.ws = null;
    }
    for (const [, req] of this.pending) {
      clearTimeout(req.timer);
    }
    this.pending.clear();
    this.activeTickSubs.clear();
    this.contractSubIds.clear();
    this.balanceSubId = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.isConnected()) {
        this.sendRaw({ ping: 1 });
      }
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private sendRaw(payload: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private request<T = any>(payload: Record<string, unknown>, timeoutMs = 12000): Promise<T> {
    if (!this.isConnected()) {
      return Promise.reject(new Error('Deriv WebSocket is not connected'));
    }

    const req_id = this.reqCounter++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(req_id);
        reject(new Error(`Request timeout (${Object.keys(payload)[0]})`));
      }, timeoutMs);

      this.pending.set(req_id, { resolve, reject, timer });
      this.sendRaw({ ...payload, req_id });
    });
  }

  private handleMessage(msg: any): void {
    const reqId = msg.req_id as number | undefined;
    if (reqId && this.pending.has(reqId)) {
      const entry = this.pending.get(reqId)!;
      this.pending.delete(reqId);
      clearTimeout(entry.timer);
      if (msg.error) {
        entry.reject(new Error(msg.error.message || msg.error.code || 'Deriv API error'));
      } else {
        entry.resolve(msg);
      }
    }

    if (msg.msg_type === 'tick' && msg.tick) {
      const symbol = msg.tick.symbol as string;
      const quote = Number(msg.tick.quote);
      const epoch = Number(msg.tick.epoch);
      const pipSize = Number(msg.tick.pip_size || 2);
      if (msg.subscription?.id) {
        this.activeTickSubs.set(symbol, msg.subscription.id);
      }
      this.callbacks.onTick?.(symbol, { epoch, quote }, pipSize);
    } else if (msg.msg_type === 'balance' && msg.balance) {
      if (msg.subscription?.id) {
        this.balanceSubId = msg.subscription.id;
      }
      this.callbacks.onBalance?.(Number(msg.balance.balance), msg.balance.currency);
    } else if (msg.msg_type === 'proposal_open_contract' && msg.proposal_open_contract) {
      const c = msg.proposal_open_contract;
      const contractId = Number(c.contract_id);
      if (msg.subscription?.id) {
        this.contractSubIds.set(contractId, msg.subscription.id);
      }
      const isSold = c.is_sold === 1;
      const status: 'open' | 'won' | 'lost' =
        c.status === 'won'
          ? 'won'
          : c.status === 'lost'
            ? 'lost'
            : isSold
              ? Number(c.profit) >= 0
                ? 'won'
                : 'lost'
              : 'open';

      this.callbacks.onOpenContractUpdate?.({
        contractId,
        entrySpot: c.entry_tick
          ? Number(c.entry_tick)
          : c.entry_spot
            ? Number(c.entry_spot)
            : null,
        currentSpot: c.current_spot ? Number(c.current_spot) : null,
        profit: Number(c.profit ?? 0),
        payout: Number(c.payout ?? 0),
        buyPrice: Number(c.buy_price ?? 0),
        status,
        isSold,
      });

      if (isSold && this.contractSubIds.has(contractId)) {
        const subId = this.contractSubIds.get(contractId)!;
        this.contractSubIds.delete(contractId);
        this.sendRaw({ forget: subId });
      }
    }
  }

  public async fetchActiveSymbols(): Promise<DerivActiveSymbolRaw[]> {
    const payload =
      this.apiMode === 'options-v1'
        ? { active_symbols: 'brief' }
        : { active_symbols: 'brief', product_type: 'basic' };
    const res = await this.request(payload, 15000);
    return (res.active_symbols || []) as DerivActiveSymbolRaw[];
  }

  public async fetchRiseFallSupport(
    symbol: string,
    currency = 'USD'
  ): Promise<{ supported: boolean; minDuration?: string; maxDuration?: string }> {
    try {
      const payload =
        this.apiMode === 'options-v1'
          ? { contracts_for: symbol }
          : { contracts_for: symbol, currency, product_type: 'basic' };
      const res = await this.request(payload, 8000);
      const available = (res.contracts_for?.available || []) as any[];
      const callEntries = available.filter(
        (c) => c.contract_type === 'CALL' && c.contract_category === 'callput'
      );
      if (callEntries.length === 0) {
        return { supported: false };
      }

      // Prioritize tick expiry first, then intraday (seconds/minutes), then daily
      const fastest =
        callEntries.find((c) => c.expiry_type === 'tick') ||
        callEntries.find((c) => c.expiry_type === 'intraday') ||
        callEntries[0];

      return {
        supported: true,
        minDuration: fastest.min_contract_duration,
        maxDuration: fastest.max_contract_duration,
      };
    } catch {
      return { supported: false };
    }
  }

  public async subscribeTicksHistory(symbol: string, count = 120): Promise<TickPoint[]> {
    if (this.activeTickSubs.has(symbol)) {
      const oldSubId = this.activeTickSubs.get(symbol)!;
      this.activeTickSubs.delete(symbol);
      this.sendRaw({ forget: oldSubId });
    }

    const res = await this.request(
      {
        ticks_history: symbol,
        adjust_start_time: 1,
        count,
        end: 'latest',
        style: 'ticks',
        subscribe: 1,
      },
      10000
    );

    if (res.subscription?.id) {
      this.activeTickSubs.set(symbol, res.subscription.id);
    }

    const prices: number[] = res.history?.prices || [];
    const times: number[] = res.history?.times || [];
    const points: TickPoint[] = [];
    for (let i = 0; i < prices.length; i++) {
      points.push({
        epoch: Number(times[i] || 0),
        quote: Number(prices[i]),
      });
    }
    return points;
  }

  public async fetchCandlesHistory(symbol: string, count = 300, granularity = 300): Promise<CandlePoint[]> {
    try {
      const res = await this.request(
        {
          ticks_history: symbol,
          adjust_start_time: 1,
          count,
          end: 'latest',
          style: 'candles',
          granularity,
        },
        12000
      );
      const candles = (res.candles || []) as any[];
      return candles.map((c) => ({
        epoch: Number(c.epoch || 0),
        close: Number(c.close || 0),
      }));
    } catch {
      return [];
    }
  }

  public async getProposalQuote(params: {
    symbol: string;
    direction: TradeDirection;
    amount: number;
    basis?: 'stake' | 'payout';
    currency: string;
    duration: number;
    durationUnit: DurationUnit;
  }): Promise<{
    proposalId: string;
    askPrice: number;
    payout: number;
    payoutPct: number;
    longcode: string;
  }> {
    const symbolField =
      this.apiMode === 'options-v1'
        ? { underlying_symbol: params.symbol }
        : { symbol: params.symbol };

    const propRes = await this.request(
      {
        proposal: 1,
        amount: Number(params.amount.toFixed(2)),
        basis: params.basis || 'stake',
        contract_type: params.direction,
        currency: params.currency,
        duration: params.duration,
        duration_unit: params.durationUnit,
        ...symbolField,
      },
      10000
    );

    const p = propRes.proposal;
    const askPrice = Number(p.ask_price);
    const payout = Number(p.payout ?? 0);
    const payoutPct = askPrice > 0 ? ((payout - askPrice) / askPrice) * 100 : 0;

    return {
      proposalId: p.id,
      askPrice,
      payout,
      payoutPct,
      longcode: p.longcode || '',
    };
  }

  private resolveAdaptiveOrderLimit(
    errMsg: string,
    attemptedAmount: number,
    attemptedBasis: 'stake' | 'payout',
    accountBalance?: number
  ): { nextAmount: number; nextBasis: 'stake' | 'payout'; reason: string } | null {
    const floor2 = (val: number) => Math.max(0.35, Math.floor(val * 100) / 100);

    // 1. "Minimum stake of 0.35 and maximum payout of 1000.00. Current payout is 1950.25."
    const maxPayoutMatch = /maximum payout (?:allowed )?(?:is|of)\s+([0-9]+(?:\.[0-9]+)?)/i.exec(errMsg);
    const curPayoutMatch = /current payout is\s+([0-9]+(?:\.[0-9]+)?)/i.exec(errMsg);
    if (maxPayoutMatch) {
      const maxPayout = Number(maxPayoutMatch[1]);
      if (curPayoutMatch && attemptedBasis === 'stake') {
        const curPayout = Number(curPayoutMatch[1]);
        if (curPayout > 0) {
          const scaled = floor2(attemptedAmount * (maxPayout / curPayout) * 0.99);
          if (scaled < attemptedAmount) {
            return {
              nextAmount: scaled,
              nextBasis: 'stake',
              reason: `Deriv max payout ${maxPayout.toFixed(2)}`,
            };
          }
        }
      }
      // Fallback: quote directly by payout basis just under max payout
      const safePayout = floor2(maxPayout * 0.99);
      return {
        nextAmount: safePayout,
        nextBasis: 'payout',
        reason: `Deriv max payout ${maxPayout.toFixed(2)}`,
      };
    }

    // 2. "Maximum stake of X" / "equal to or lower than X" / "between X and Y"
    const maxStakeMatch =
      /(?:maximum stake (?:is|of)|equal to or lower than|less than or equal to|must be between [0-9.]+ and)\s+([0-9]+(?:\.[0-9]+)?)/i.exec(
        errMsg
      );
    if (maxStakeMatch) {
      const maxStake = Number(maxStakeMatch[1]);
      const clamped = floor2(maxStake * 0.995);
      if (clamped < attemptedAmount) {
        return {
          nextAmount: clamped,
          nextBasis: 'stake',
          reason: `Deriv max stake ${maxStake.toFixed(2)}`,
        };
      }
    }

    // 3. "Your account balance (123.45 USD) is insufficient..."
    if (/insufficient/i.test(errMsg) || /balance/i.test(errMsg)) {
      const balMatch = /balance\s*\(?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(errMsg);
      const avail = balMatch ? Number(balMatch[1]) : accountBalance;
      if (avail && avail >= 0.35) {
        const safeBal = floor2(avail * 0.98);
        if (safeBal < attemptedAmount) {
          return {
            nextAmount: safeBal,
            nextBasis: 'stake',
            reason: `Available balance ${avail.toFixed(2)}`,
          };
        }
      }
    }

    // 4. "Minimum stake of X"
    const minStakeMatch = /minimum stake (?:is|of)\s+([0-9]+(?:\.[0-9]+)?)/i.exec(errMsg);
    if (minStakeMatch && attemptedBasis === 'stake' && attemptedAmount < Number(minStakeMatch[1])) {
      const minStake = Number(minStakeMatch[1]);
      return {
        nextAmount: Math.ceil(minStake * 100) / 100,
        nextBasis: 'stake',
        reason: `Deriv min stake ${minStake.toFixed(2)}`,
      };
    }

    return null;
  }

  public async executeRiseFallTrade(params: {
    symbol: string;
    displayName: string;
    direction: TradeDirection;
    amount: number;
    currency: string;
    duration: number;
    durationUnit: DurationUnit;
    martingaleStep: number;
    confidence: number;
    accountBalance?: number;
  }): Promise<ActiveContractState & { adjustedFrom?: number; adjustmentReason?: string }> {
    let attemptAmount = Math.max(0.35, Number(params.amount.toFixed(2)));
    if (params.accountBalance !== undefined && params.accountBalance >= 0.35 && attemptAmount > params.accountBalance) {
      attemptAmount = Math.max(0.35, Math.floor(params.accountBalance * 0.98 * 100) / 100);
    }

    let attemptBasis: 'stake' | 'payout' = 'stake';
    let adjustmentReason: string | undefined =
      attemptAmount < Number(params.amount.toFixed(2)) ? 'Account balance cap' : undefined;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const proposal = await this.getProposalQuote({
          symbol: params.symbol,
          direction: params.direction,
          amount: attemptAmount,
          basis: attemptBasis,
          currency: params.currency,
          duration: params.duration,
          durationUnit: params.durationUnit,
        });

        // Respect balance even if payout basis produced a slightly higher askPrice
        if (
          params.accountBalance !== undefined &&
          proposal.askPrice > params.accountBalance &&
          params.accountBalance >= 0.35
        ) {
          attemptBasis = 'stake';
          attemptAmount = Math.max(0.35, Math.floor(params.accountBalance * 0.98 * 100) / 100);
          adjustmentReason = 'Account balance cap';
          continue;
        }

        const buyRes = await this.request(
          {
            buy: proposal.proposalId,
            price: Number((proposal.askPrice * 1.02).toFixed(2)),
          },
          10000
        );

        const b = buyRes.buy;
        const contractId = Number(b.contract_id);

        this.request(
          {
            proposal_open_contract: 1,
            contract_id: contractId,
            subscribe: 1,
          },
          8000
        ).catch(() => {});

        const actualStake = Number(b.buy_price ?? proposal.askPrice);
        return {
          contractId,
          symbol: params.symbol,
          displayName: params.displayName,
          direction: params.direction,
          buyPrice: actualStake,
          payout: Number(b.payout ?? proposal.payout),
          currency: params.currency,
          entrySpot: null,
          currentSpot: null,
          profit: 0,
          dateStart: Number(b.start_time || Math.floor(Date.now() / 1000)),
          dateExpiry: 0,
          status: 'open',
          isSold: false,
          martingaleStep: params.martingaleStep,
          confidence: params.confidence,
          longcode: b.longcode || proposal.longcode,
          adjustedFrom:
            adjustmentReason || Math.abs(actualStake - params.amount) > 0.05
              ? Number(params.amount.toFixed(2))
              : undefined,
          adjustmentReason,
        };
      } catch (err: any) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const adjusted = this.resolveAdaptiveOrderLimit(
          lastError.message,
          attemptAmount,
          attemptBasis,
          params.accountBalance
        );
        if (adjusted) {
          attemptAmount = adjusted.nextAmount;
          attemptBasis = adjusted.nextBasis;
          adjustmentReason = adjusted.reason;
          continue;
        }
        // If buy failed due to small price/payout tick near ceiling, trim 1.5% and retry once
        if (/payout|price|limit/i.test(lastError.message) && attemptAmount > 0.5) {
          attemptAmount = Math.max(0.35, Math.floor(attemptAmount * 0.985 * 100) / 100);
          adjustmentReason = 'Deriv limit clamp';
          continue;
        }
        throw lastError;
      }
    }

    throw lastError || new Error('Failed to place Rise/Fall trade after limit adjustment');
  }
}
