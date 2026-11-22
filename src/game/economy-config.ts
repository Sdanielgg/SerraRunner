import type { VehicleId } from './vehicles';

export const economyRules = {
  courseId: 'serra-circuit-race-v3', pickupPolicy: 'individual-per-round',
  coinAmount: 10, fuelPickupLitres: 5, pickupRadius: 2.3, pickupMaxStep: 3,
  recoveryPickupDelaySeconds: 0.5, rewardPerRotation: 25, maxRotations: 8,
  rotationLandingTolerance: 0.1,
  airAngularAcceleration: 18, maxAirPitchSpeed: 7,
  groundArmSeconds: 0.18, minAirSeconds: 0.3, minClearance: 0.35, maxAirSeconds: 8,
  landingUp: 0.8, stableUp: 0.93, maxLandingImpact: 8,
  stableAngularSpeed: 1.2, stableVerticalSpeed: 1, stableWheels: 3,
  stableSeconds: 0.35, landingTimeoutSeconds: 1.5,
  walletRetryMs: 2000, walletBatchSize: 64, maxRaceHeight: 16,
} as const;
export const fuelRules: Record<VehicleId, { capacity: number; litresPerSecond: number }> = {
  jeep: { capacity: 12, litresPerSecond: 0.08 }, crawler: { capacity: 18, litresPerSecond: 0.12 },
  rally: { capacity: 10, litresPerSecond: 0.1 }, gt3: { capacity: 14, litresPerSecond: 0.18 },
};
export type RewardKind = 'coin' | 'stunt';
export type RewardEvent = { id: string; round_id: string; event_key: string; kind: RewardKind; amount: number };
export type EconomySnapshot = { fuel: number; capacity: number; balance: number | null; unconfirmed: number; earned: number; pendingReward: number; rotations: number; jumpId: number; collected: string[]; walletStatus: 'loading' | 'saved' | 'pending' | 'error' };
