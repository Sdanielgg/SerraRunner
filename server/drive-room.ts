import { randomBytes } from 'node:crypto';
import { Room, ServerError, type Client } from '@colyseus/core';
import { createPhysics, createPhysicsWorld, emptyControls, type Controls, type Gearing } from '../src/game/physics';
import { isVehicleId, MAX_PLAYERS, NETWORK_VERSION, type PlayerSnapshot, type RoomSnapshot, type TestLocation } from '../src/game/network-types';
import type { VehicleId } from '../src/game/vehicles';

type Player = {
  name: string; slot: number; vehicleId: VehicleId; car: ReturnType<typeof createPhysics>;
  controls: Controls; gearing: Gearing; revision: number; seq: number;
  lastInput: number; lastAction: number; bucketStart: number; messages: number;
};
const activeCodes = new Set<string>();
const dt = 1 / 60;

export class DriveRoom extends Room {
  maxClients = MAX_PLAYERS;
  private world = createPhysicsWorld();
  private players = new Map<string, Player>();
  private tick = 0;
  private accumulator = 0;

  async onCreate() {
    if (activeCodes.size >= 32) throw new ServerError(503, 'Servidor cheio. Tenta novamente mais tarde.');
    do { this.roomId = randomBytes(4).toString('hex').toUpperCase(); } while (activeCodes.has(this.roomId));
    activeCodes.add(this.roomId);
    await this.setPrivate(true);
    this.setPatchRate(null);
    this.onMessage('input', (client, payload: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || !this.admit(player) || !payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if (!Number.isSafeInteger(value.seq) || (value.seq as number) <= player.seq || !value.controls || typeof value.controls !== 'object') return;
      if (value.gearing !== 'low' && value.gearing !== 'high') return;
      const raw = value.controls as Record<string, unknown>;
      const controls = emptyControls();
      for (const key of Object.keys(controls) as (keyof Controls)[]) controls[key] = raw[key] === true;
      player.controls = controls; player.gearing = value.gearing;
      player.seq = value.seq as number; player.lastInput = Date.now();
    });
    this.onMessage('vehicle', (client, payload: unknown) => {
      const player = this.players.get(client.sessionId);
      if (!player || !this.actionAllowed(player) || !payload || typeof payload !== 'object') return;
      const value = payload as Record<string, unknown>;
      if (!isVehicleId(value.vehicleId) || (value.location !== 'garage' && value.location !== 'trail')) return;
      player.car.dispose(); player.vehicleId = value.vehicleId; player.car = createPhysics(value.vehicleId, this.world);
      this.respawn(player, value.location);
    });
    this.onMessage('reset', (client, location: unknown) => {
      const player = this.players.get(client.sessionId);
      if (player && this.actionAllowed(player) && (location === 'garage' || location === 'trail')) this.respawn(player, location);
    });
    this.onMessage('ping', (client, sent: unknown) => {
      const player = this.players.get(client.sessionId);
      if (player && this.admit(player) && typeof sent === 'number' && Number.isFinite(sent)) client.send('pong', sent);
    });
    this.setSimulationInterval(delta => {
      this.accumulator = Math.min(0.1, this.accumulator + delta / 1000);
      while (this.accumulator >= dt) {
        this.accumulator -= dt;
        for (const player of this.players.values()) {
          if (Date.now() - player.lastInput > 500) player.controls = emptyControls();
          player.car.applyControls(dt, player.controls, player.gearing);
        }
        this.world.step(dt); this.tick++;
        for (const player of this.players.values()) {
          const position = player.car.chassis.position;
          if (!Number.isFinite(position.y) || position.y < -10 || Math.abs(position.x) > 240 || Math.abs(position.z) > 240) this.respawn(player, 'garage');
        }
        if (this.tick % 3 === 0) this.broadcast('snapshot', this.snapshot());
      }
    }, 1000 / 60);
  }

  onAuth(_client: Client, options: Record<string, unknown>) {
    if (options?.version !== NETWORK_VERSION) throw new ServerError(400, 'Atualiza o jogo: a versão do servidor é diferente.');
    return true;
  }

  onJoin(client: Client, options: Record<string, unknown>) {
    const used = new Set([...this.players.values()].map(player => player.slot));
    let slot = 0; while (used.has(slot)) slot++;
    const vehicleId = isVehicleId(options.vehicleId) ? options.vehicleId : 'jeep';
    const name = typeof options.name === 'string' ? options.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 20) : '';
    const player: Player = {
      name: name || `Condutor ${slot + 1}`, slot, vehicleId, car: createPhysics(vehicleId, this.world),
      controls: emptyControls(), gearing: 'high', revision: 0, seq: -1,
      lastInput: Date.now(), lastAction: 0, bucketStart: Date.now(), messages: 0,
    };
    this.players.set(client.sessionId, player); this.respawn(player, 'garage');
    client.send('snapshot', this.snapshot());
  }

  async onLeave(client: Client, consented: boolean) {
    const player = this.players.get(client.sessionId);
    if (!player) return;
    player.controls = { ...emptyControls(), brake: true };
    if (!consented) {
      try {
        await this.allowReconnection(client, 15);
        player.seq = -1; player.lastInput = Date.now(); return;
      } catch { /* Remove the vehicle after the reconnection window expires. */ }
    }
    player.car.dispose(); this.players.delete(client.sessionId);
    this.broadcast('snapshot', this.snapshot());
  }

  onDispose() {
    for (const player of this.players.values()) player.car.dispose();
    this.players.clear(); activeCodes.delete(this.roomId);
  }

  private admit(player: Player) {
    const now = Date.now();
    if (now - player.bucketStart >= 1000) { player.bucketStart = now; player.messages = 0; }
    return ++player.messages <= 100;
  }

  private actionAllowed(player: Player) {
    if (!this.admit(player) || Date.now() - player.lastAction < 400) return false;
    player.lastAction = Date.now(); return true;
  }

  private respawn(player: Player, location: TestLocation) {
    const x = (player.slot - 1.5) * 4;
    player.car.reset({ x: location === 'trail' ? -35 + x : x, y: 1.5, z: 6, yaw: location === 'trail' ? 0 : -0.35 });
    player.gearing = location === 'trail' ? 'low' : 'high';
    player.controls = emptyControls(); player.revision++;
  }

  private snapshot(): RoomSnapshot {
    const players: PlayerSnapshot[] = [...this.players].map(([id, player]) => {
      const { chassis } = player.car;
      return {
        id, name: player.name, vehicleId: player.vehicleId, gearing: player.gearing, revision: player.revision,
        body: { position: { ...chassis.position }, quaternion: { ...chassis.quaternion } },
        wheels: player.car.getWheelTransforms(false).map(wheel => ({ position: { ...wheel.position }, quaternion: { ...wheel.quaternion } })),
        ...player.car.getTelemetry(),
      };
    });
    return { version: NETWORK_VERSION, tick: this.tick, players };
  }
}
