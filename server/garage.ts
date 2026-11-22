import { randomUUID } from 'node:crypto';
import { baseUpgrades, nextUpgradeEffect, upgradeKinds, upgradeRules, type GarageSnapshot, type UpgradeKind } from '../src/game/upgrades';
import type { VehicleId } from '../src/game/vehicles';
import { PurchaseRejected, type GameServices, type Purchase } from './supabase';

export function createGarage(matchId: string, userId: string, vehicleId: VehicleId, services: GameServices, onBalance: (value: number) => void) {
  let state: GarageSnapshot = { vehicleId, balance: null, levels: baseUpgrades(), offers: [], status: 'loading', message: '' };
  let pending: Purchase | null = null; let busy = false;
  const completed = new Set<string>();
  function offers() { state.offers = upgradeKinds.map(kind => ({ kind, operationId: randomUUID(), level: state.levels[kind], price: upgradeRules[kind].prices[state.levels[kind]] ?? null, nextEffect: nextUpgradeEffect(vehicleId, kind, state.levels) })); }
  return {
    snapshot: () => ({ ...state, levels: { ...state.levels }, offers: state.offers.map(o => ({ ...o })), pendingOperation: pending?.operation_id }),
    blocked: () => busy || pending !== null || state.status !== 'ready',
    hasPending: () => pending !== null,
    async load() {
      if (busy || pending) return;
      busy = true; state.status = 'loading';
      try { const data = await services.garage(matchId, userId, vehicleId); state = { ...state, ...data, status: 'ready', message: '' }; offers(); onBalance(data.balance); }
      catch (error) { state.status = 'error'; state.message = error instanceof Error ? error.message : 'Falha ao carregar garagem.'; }
      finally { busy = false; }
    },
    async buy(operationId: string, kind: UpgradeKind) {
      if (completed.has(operationId)) return;
      if (busy) {
        if (pending?.operation_id === operationId && pending.upgrade_type === kind) return;
        throw new Error('Aguarda a confirmação da operação em curso.');
      }
      const offer = state.offers.find(o => o.operationId === operationId && o.kind === kind);
      if (!pending && (state.status !== 'ready' || !offer || offer.price === null)) throw new Error('Oferta inválida ou expirada.');
      if (pending && (pending.operation_id !== operationId || pending.upgrade_type !== kind)) throw new Error('Confirma primeiro a compra pendente.');
      pending ??= { operation_id: operationId, match_id: matchId, target_user: userId, chosen_vehicle: vehicleId, upgrade_type: kind, expected_level: offer!.level, catalog_version: upgradeRules.version };
      busy = true; state.status = 'buying'; state.message = 'A confirmar compra…';
      try {
        const data = await services.purchase(pending); completed.add(operationId); pending = null;
        state = { ...state, ...data, status: 'ready', message: 'Compra confirmada. Será aplicada na próxima ronda.' }; offers(); onBalance(data.balance);
      } catch (error) {
        if (error instanceof PurchaseRejected) { pending = null; state.status = 'ready'; offers(); }
        else state.status = 'error';
        state.message = error instanceof Error ? error.message : 'Compra por confirmar. Repete o mesmo pedido.';
      } finally { busy = false; }
    },
  };
}
