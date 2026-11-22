import type { VehicleId } from './vehicles';
import { vehicles } from './vehicles';
import { economyRules, fuelRules } from './economy-config';

export const upgradeRules = {
  version: 1,
  engine: { name: 'Motor', prices: [40, 70, 110], step: 0.10 },
  tank: { name: 'Depósito', prices: [30, 60, 100], step: 0.25 },
  air: { name: 'Controlo aéreo', prices: [30, 55, 90], step: 0.20 },
} as const;
export type UpgradeKind = 'engine' | 'tank' | 'air';
export const upgradeKinds: UpgradeKind[] = ['engine', 'tank', 'air'];
export type UpgradeLevels = Record<UpgradeKind, number>;
export const baseUpgrades = (): UpgradeLevels => ({ engine: 0, tank: 0, air: 0 });
export function upgradeEffect(id: VehicleId, kind: UpgradeKind, level: number) {
  const levels = { ...baseUpgrades(), [kind]: level };
  const parameters = upgradedParameters(id, levels);
  if (kind === 'engine') return `Força +${Math.round(level * upgradeRules.engine.step * 100)}%`;
  if (kind === 'tank') return `${parameters.capacity.toFixed(1)} L`;
  return `Controlo aéreo +${Math.round(level * upgradeRules.air.step * 100)}%`;
}
export function isUpgradeKind(value: unknown): value is UpgradeKind { return upgradeKinds.includes(value as UpgradeKind); }
export function validateUpgrades(value: unknown): UpgradeLevels {
  const levels = value as UpgradeLevels;
  if (!levels || upgradeKinds.some(k => !Number.isInteger(levels[k]) || levels[k] < 0 || levels[k] > upgradeRules[k].prices.length)) throw new Error('Níveis de melhoria inválidos.');
  return { engine: levels.engine, tank: levels.tank, air: levels.air };
}
export function upgradedParameters(id: VehicleId, levels: UpgradeLevels) {
  const spec = vehicles[id]; const engine = 1 + levels.engine * upgradeRules.engine.step;
  return { lowForce: spec.low.engineForce * engine, highForce: spec.high.engineForce * engine,
    capacity: fuelRules[id].capacity * (1 + levels.tank * upgradeRules.tank.step),
    airAcceleration: economyRules.airAngularAcceleration * (1 + levels.air * upgradeRules.air.step) };
}
export type GarageOffer = { kind: UpgradeKind; operationId: string; level: number; price: number | null; nextEffect: string };
export type GarageSnapshot = { vehicleId: VehicleId; balance: number | null; levels: UpgradeLevels; offers: GarageOffer[]; status: 'loading' | 'ready' | 'buying' | 'error'; message: string; pendingOperation?: string };
export function nextUpgradeEffect(id: VehicleId, kind: UpgradeKind, levels: UpgradeLevels) {
  if (levels[kind] >= upgradeRules[kind].prices.length) return 'Nível máximo';
  const next = upgradedParameters(id, { ...levels, [kind]: levels[kind] + 1 });
  if (kind === 'engine') return `Força do motor +${Math.round((levels.engine + 1) * upgradeRules.engine.step * 100)}% face à origem; velocidade máxima base`;
  if (kind === 'tank') return `Capacidade ${next.capacity.toFixed(1)} L; consumo base`;
  return `Aceleração angular ${next.airAcceleration.toFixed(1)} rad/s²; só no ar`;
}
