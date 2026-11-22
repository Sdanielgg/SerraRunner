import { createStuntTracker, type StuntSample } from './stunts';
import { economyRules, type RewardKind } from './economy-config';
import { racePickups } from './economy-course';

type Position = { x: number; y: number; z: number };
function segmentDistance(p: Position, a: Position, b: Position) {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / (dx * dx + dy * dy + dz * dz || 1)));
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t, p.z - a.z - dz * t);
}
export function createRaceEconomy(onReward: (key: string, kind: RewardKind, amount: number) => void) {
  const tracker = createStuntTracker(); const collected = new Set<string>();
  let previous: Position | null = null; let earned = 0; let clock = 0; let pickupAfter = 0;
  return {
    status: () => ({ ...tracker.status(), earned, collected: [...collected] }),
    cancel() { tracker.cancel(); previous = null; pickupAfter = clock + economyRules.recoveryPickupDelaySeconds; },
    step(dt: number, sample: StuntSample, eligible: boolean, fuel: number, capacity: number) {
      clock += dt;
      const reward = tracker.step(dt, sample, eligible);
      if (reward) { earned += reward.amount; onReward(reward.key, 'stunt', reward.amount); }
      let addedFuel = 0;
      if (eligible && clock >= pickupAfter && previous && Math.hypot(sample.position.x - previous.x, sample.position.y - previous.y, sample.position.z - previous.z) <= economyRules.pickupMaxStep) {
        for (const pickup of racePickups) {
          if (collected.has(pickup.id) || segmentDistance(pickup, previous, sample.position) > economyRules.pickupRadius) continue;
          if (pickup.kind === 'fuel') {
            const amount = Math.min(economyRules.fuelPickupLitres, capacity - fuel - addedFuel);
            if (amount <= 1e-6) continue;
            addedFuel += amount;
          } else { earned += economyRules.coinAmount; onReward(`coin:${pickup.id}`, 'coin', economyRules.coinAmount); }
          collected.add(pickup.id);
        }
      }
      previous = eligible ? { ...sample.position } : null;
      return addedFuel;
    },
  };
}
