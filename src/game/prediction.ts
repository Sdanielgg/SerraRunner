import { Body, Box, Vec3 } from 'cannon-es';
import { createPhysics, emptyControls, type Controls, type Gearing } from './physics';
import { createChassisShape } from './chassis-shape';
import { vehicles } from './vehicles';
import type { InputCommand, PlayerSnapshot, RoomSnapshot } from './network-types';
import { networkTiming } from './network-config';

const dt = 1 / networkTiming.simulationHz;
export function createPrediction() {
  let car: ReturnType<typeof createPhysics> | null = null;
  let vehicleId: string | null = null; let revision = -1; let ready = false;
  let nextSequence = 0; let accumulator = 0; let enabled = false;
  let lastTick = -1;
  let pending: InputCommand[] = [];
  const offset = new Vec3();
  const proxies = new Map<string, { body: Body; vehicleId: string }>();
  function clearProxies() { if (car) for (const p of proxies.values()) car.world.removeBody(p.body); proxies.clear(); }
  function synchronizeProxies(snapshot: RoomSnapshot, self: PlayerSnapshot) {
    if (!car) return;
    const keep = new Set<string>();
    for (const player of snapshot.players) {
      if (player.id === self.id || Math.hypot(player.body.position.x - self.body.position.x, player.body.position.z - self.body.position.z) > 30) continue;
      keep.add(player.id);
      let proxy = proxies.get(player.id);
      if (proxy && proxy.vehicleId !== player.vehicleId) { car.world.removeBody(proxy.body); proxies.delete(player.id); proxy = undefined; }
      if (!proxy) {
        const spec = vehicles[player.vehicleId];
        const body = new Body({ mass: 0, type: Body.KINEMATIC }); body.addShape(createChassisShape(spec));
        body.addShape(new Box(new Vec3(0.72 * spec.widthScale, 0.45 * spec.heightScale, 0.9 * spec.lengthScale)), new Vec3(0, 0.75 * spec.heightScale, 0.4 * spec.lengthScale));
        proxy = { body, vehicleId: player.vehicleId }; proxies.set(player.id, proxy); car.world.addBody(body);
      }
      const b = proxy.body; const pose = player.body;
      b.position.set(pose.position.x, pose.position.y, pose.position.z); b.quaternion.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w);
      const v = player.physics?.velocity; b.velocity.set(v?.x ?? 0, v?.y ?? 0, v?.z ?? 0); b.aabbNeedsUpdate = true;
    }
    for (const [id, proxy] of proxies) if (!keep.has(id)) { car.world.removeBody(proxy.body); proxies.delete(id); }
  }
  return {
    reconcile(snapshot: RoomSnapshot, sessionId: string) {
      if (ready && snapshot.tick <= lastTick) return;
      const self = snapshot.players.find(p => p.id === sessionId);
      if (!self?.physics) return;
      const reset = !ready || vehicleId !== self.vehicleId || revision !== self.revision;
      if (vehicleId !== self.vehicleId || !car) { clearProxies(); car?.dispose(); car = createPhysics(self.vehicleId); vehicleId = self.vehicleId; }
      const old = car.chassis.position.clone();
      const ack = self.acknowledgedSeq ?? -1;
      nextSequence = Math.max(nextSequence, ack + 1);
      pending = reset ? [] : pending.filter(c => c.seq > ack);
      if (pending.length > networkTiming.predictionHistory) pending = [];
      car.restoreState(self.physics); synchronizeProxies(snapshot, self);
      enabled = self.controlsEnabled !== false;
      for (const command of pending) { car.applyControls(dt, enabled ? command.controls : { ...emptyControls(), brake: true }, command.gearing); car.world.step(dt); }
      const correction = old.vsub(car.chassis.position);
      if (reset || correction.length() > networkTiming.snapDistance) offset.setZero();
      else offset.vadd(correction, offset);
      revision = self.revision; ready = true;
      lastTick = snapshot.tick;
      if (reset) accumulator = 0;
    },
    advance(seconds: number, controls: Controls, gearing: Gearing) {
      const commands: InputCommand[] = [];
      if (!car || !ready) return commands;
      accumulator = Math.min(0.05, accumulator + seconds);
      while (accumulator + 1e-9 >= dt) {
        accumulator -= dt;
        const command = { seq: nextSequence++, controls: { ...(enabled ? controls : { ...emptyControls(), brake: true }) }, gearing };
        pending.push(command); commands.push(command);
        car.applyControls(dt, command.controls, gearing); car.world.step(dt);
      }
      if (pending.length > networkTiming.predictionHistory) { pending = []; ready = false; }
      offset.scale(Math.exp(-seconds / networkTiming.correctionSeconds), offset);
      return commands;
    },
    pose() { return car && ready ? { car, offset, telemetry: car.getTelemetry() } : null; },
    clearPending() { pending = []; },
    suspend() { ready = false; pending = []; accumulator = 0; lastTick = -1; offset.setZero(); },
    debug: () => ({ pending: pending.length, ready, nextSequence, revision, proxyCount: proxies.size }),
    dispose() { clearProxies(); car?.dispose(); car = null; ready = false; pending = []; },
  };
}
