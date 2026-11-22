import { Quaternion, Vec3 } from 'cannon-es';
import { economyRules as rules } from './economy-config';
export type StuntSample = { position: { x: number; y: number; z: number }; quaternion: { x: number; y: number; z: number; w: number }; velocity: { x: number; y: number; z: number }; angularSpeed: number; wheels: number; bodyContact: boolean; impact: number; clearance: number };

export function createStuntTracker() {
  let phase: 'ground' | 'air' | 'landing' | 'invalid' = 'ground';
  let armed = false; let groundTime = 0; let airTime = 0; let stableTime = 0; let landingTime = 0;
  let netAngle = 0; let peakAngle = 0; let maxClearance = 0; let jumpId = 0; let previousFallSpeed = 0;
  let previous = new Quaternion();
  const q = new Quaternion(); const inverse = new Quaternion(); const delta = new Quaternion(); const axis = new Vec3();
  function rotations() { return Math.min(rules.maxRotations, Math.floor((peakAngle + 1e-5) / (Math.PI * 2)), Math.floor((Math.abs(netAngle) + rules.rotationLandingTolerance) / (Math.PI * 2))); }
  function invalidate() { phase = 'invalid'; armed = false; netAngle = 0; stableTime = groundTime = 0; }
  return {
    cancel: invalidate,
    status: () => ({ jumpId, rotations: phase === 'air' || phase === 'landing' ? rotations() : 0, pendingReward: (phase === 'air' || phase === 'landing') && airTime >= rules.minAirSeconds && maxClearance >= rules.minClearance ? rotations() * rules.rewardPerRotation : 0 }),
    step(dt: number, sample: StuntSample, eligible = true): { key: string; amount: number } | null {
      if (!eligible) { invalidate(); return null; }
      q.set(sample.quaternion.x, sample.quaternion.y, sample.quaternion.z, sample.quaternion.w); q.normalize();
      const up = 1 - 2 * (q.x * q.x + q.z * q.z);
      const stable = sample.wheels >= rules.stableWheels && !sample.bodyContact && up >= rules.stableUp && sample.angularSpeed <= rules.stableAngularSpeed && Math.abs(sample.velocity.y) <= rules.stableVerticalSpeed;
      if (phase === 'ground' || phase === 'invalid') {
        groundTime = stable ? groundTime + dt : 0;
        if (groundTime >= rules.groundArmSeconds) { phase = 'ground'; armed = true; }
        if (armed && sample.wheels === 0 && !sample.bodyContact) {
          phase = 'air'; jumpId++; netAngle = peakAngle = 0; airTime = 0; maxClearance = 0; previous.copy(q); armed = false; previousFallSpeed = Math.max(0, -sample.velocity.y);
        }
        return null;
      }
      if (sample.bodyContact || sample.position.y < -2) { invalidate(); return null; }
      if (phase === 'air') {
        airTime += dt; maxClearance = Math.max(maxClearance, sample.clearance);
        if (sample.wheels === 0) {
          previous.conjugate(inverse); inverse.mult(q, delta); delta.normalize();
          if (delta.w < 0) { delta.x *= -1; delta.y *= -1; delta.z *= -1; delta.w *= -1; }
          const [, angle] = delta.toAxisAngle(axis);
          if (angle > Math.PI / 2 || airTime > rules.maxAirSeconds) { invalidate(); return null; }
          netAngle += angle * axis.x; peakAngle = Math.max(peakAngle, Math.abs(netAngle)); previous.copy(q); previousFallSpeed = Math.max(0, -sample.velocity.y);
          return null;
        }
        if (up < rules.landingUp || Math.max(previousFallSpeed, sample.impact) > rules.maxLandingImpact || airTime < rules.minAirSeconds || maxClearance < rules.minClearance) { invalidate(); return null; }
        phase = 'landing'; landingTime = stableTime = 0;
      }
      if (phase === 'landing') {
        landingTime += dt;
        if (sample.wheels === 0 || up < rules.landingUp || sample.impact > rules.maxLandingImpact || landingTime > rules.landingTimeoutSeconds) { invalidate(); return null; }
        stableTime = stable ? stableTime + dt : 0;
        if (stableTime >= rules.stableSeconds) {
          const amount = rotations() * rules.rewardPerRotation; const key = `jump:${jumpId}`;
          phase = 'ground'; armed = true; groundTime = rules.groundArmSeconds; netAngle = 0;
          return amount ? { key, amount } : null;
        }
      }
      return null;
    },
  };
}
