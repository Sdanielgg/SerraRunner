import type { Controls, Gearing } from './physics';
import type { VehicleId } from './vehicles';

// Clients and servers must agree on the circuit and its physical barriers.
export const NETWORK_VERSION = 2;
export const MAX_PLAYERS = 4;
export const ROOM_NAME = 'serra_drive';
export type TestLocation = 'garage' | 'trail' | 'race';
export type Vector = { x: number; y: number; z: number };
export type Rotation = Vector & { w: number };
export type Pose = { position: Vector; quaternion: Rotation };
export type PlayerSnapshot = {
  id: string; name: string; vehicleId: VehicleId; gearing: Gearing; revision: number;
  body: Pose; wheels: Pose[]; speed: number; reverse: boolean;
};
export type RoomSnapshot = { version: number; tick: number; players: PlayerSnapshot[] };
export type InputMessage = { seq: number; controls: Controls; gearing: Gearing };
export type RoomInfo = { code: string; sessionId: string; players: { id: string; name: string; vehicleId: VehicleId }[] };

export function isVehicleId(value: unknown): value is VehicleId {
  return value === 'jeep' || value === 'crawler' || value === 'rally';
}

export function isTestLocation(value: unknown): value is TestLocation {
  return value === 'garage' || value === 'trail' || value === 'race';
}

export function serverAddress(value: string) {
  const address = value.trim().replace(/\/+$/, '');
  if (!address) throw new Error('Indica o endereço do servidor online.');
  let url: URL;
  try { url = new URL(address); } catch { throw new Error('Endereço inválido. Usa https:// ou wss://.'); }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || (url.pathname !== '' && url.pathname !== '/')) {
    throw new Error('Usa apenas o endereço do servidor, por exemplo https://serra.onrender.com.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname);
  if (!local && ['http:', 'ws:'].includes(url.protocol)) throw new Error('Para jogar pela Internet usa https:// ou wss://.');
  return address;
}
