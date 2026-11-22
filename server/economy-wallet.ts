import { randomUUID } from 'node:crypto';
import { economyRules, type RewardEvent, type RewardKind } from '../src/game/economy-config';
import type { GameServices } from './supabase';

export function createEconomyWallet(userId: string, services: GameServices) {
  const pending = new Map<string, RewardEvent>(); const seen = new Set<string>();
  let balance: number | null = null; let saving = false; let nextRetry = 0; let version = 0;
  let status: 'loading' | 'saved' | 'pending' | 'error' = 'loading';
  return {
    events: (roundId: string) => [...pending.values()].filter(e => e.round_id === roundId).map(e => ({ ...e })),
    confirm(events: RewardEvent[], amount: number) {
      version++; balance = amount;
      for (const event of events) pending.delete(`${event.round_id}:${event.event_key}`);
      status = pending.size ? 'pending' : 'saved';
    },
    setBalance(amount: number) { version++; balance = amount; if (!pending.size) status = 'saved'; },
    snapshot: () => ({ balance, unconfirmed: [...pending.values()].reduce((n, e) => n + e.amount, 0), walletStatus: status }),
    hasPending: () => pending.size > 0 || saving,
    async load() {
      const requestVersion = version;
      try { const amount = await services.getBalance(userId); if (version === requestVersion) { balance = amount; if (!pending.size) status = 'saved'; } }
      catch { if (version === requestVersion && balance === null) status = 'error'; }
    },
    enqueue(roundId: string, key: string, kind: RewardKind, amount: number) {
      const identity = `${roundId}:${key}`;
      if (seen.has(identity) || !Number.isSafeInteger(amount) || amount <= 0) return;
      seen.add(identity); pending.set(identity, { id: randomUUID(), round_id: roundId, event_key: key, kind, amount }); status = 'pending';
    },
    async flush(force = false) {
      if (saving || !pending.size || !force && Date.now() < nextRetry) return;
      saving = true; status = 'pending';
      const batch = [...pending.values()].slice(0, economyRules.walletBatchSize);
      try {
        const amount = await services.creditRewards(userId, batch);
        version++; balance = amount;
        for (const event of batch) pending.delete(`${event.round_id}:${event.event_key}`);
        status = pending.size ? 'pending' : 'saved'; nextRetry = 0;
      } catch { status = 'error'; nextRetry = Date.now() + economyRules.walletRetryMs; }
      finally { saving = false; }
    },
  };
}
