import { createClient } from '@supabase/supabase-js';
import { ServerError } from '@colyseus/core';
import { validateProfile } from '../src/auth/profile';
import type { VehicleId } from '../src/game/vehicles';
import { authRules } from '../src/auth/config';
import type { TournamentRoundRecord } from '../src/game/tournament';
import type { RewardEvent } from '../src/game/economy-config';
import { upgradeKinds, upgradeRules, validateUpgrades, type UpgradeKind, type UpgradeLevels } from '../src/game/upgrades';

export type VerifiedIdentity = { userId: string; name: string; color: string; expiresAt: number };
export type VerifiedResult = { id: string; user_id: string; course_id: string; vehicle_id: VehicleId; elapsed_ms: number; room_code: string };
export type GarageData = { balance: number; levels: UpgradeLevels };
export type CompetitionSync = { match_id: string; round_id: string; round_number: number; room_code: string; host_user_id: string; target_points: number; phase: 'countdown' | 'garage' | 'finished'; members: { user_id: string; vehicle_id: VehicleId; active?: boolean }[] };
export type Purchase = { operation_id: string; match_id: string; target_user: string; chosen_vehicle: VehicleId; upgrade_type: UpgradeKind; expected_level: number; catalog_version: number };
export class PurchaseRejected extends Error {}
export type GameServices = { verify: (token: unknown) => Promise<VerifiedIdentity>; saveResult: (result: VerifiedResult) => Promise<void>; saveRound: (round: TournamentRoundRecord) => Promise<Record<string, number>>; syncCompetition: (payload: CompetitionSync) => Promise<Record<string, GarageData>>; garage: (matchId: string, userId: string, vehicleId: VehicleId) => Promise<GarageData>; purchase: (purchase: Purchase) => Promise<GarageData>; getBalance: (userId: string) => Promise<number>; creditRewards: (userId: string, events: RewardEvent[]) => Promise<number>; canPersist: boolean };
function garageData(value: unknown): GarageData {
  const data = value as GarageData;
  if (!data || !Number.isSafeInteger(Number(data.balance)) || Number(data.balance) < 0) throw new Error('Saldo da garagem inválido.');
  return { balance: Number(data.balance), levels: validateUpgrades(data.levels) };
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(authRules.requestTimeoutMs) }) } };

export function createSupabaseServices(env: NodeJS.ProcessEnv = process.env): GameServices {
  const url = env.SUPABASE_URL?.trim(); const key = env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const secret = env.SUPABASE_SECRET_KEY?.trim();
  const client = url && key ? createClient(url, key, options) : null;
  const admin = url && secret ? createClient(url, secret, options) : null;
  return {
    canPersist: Boolean(client && admin),
    async verify(token) {
      if (!client) throw new ServerError(503, 'Autenticação do servidor ainda não configurada.');
      if (typeof token !== 'string' || token.length > authRules.maxTokenLength || token.split('.').length !== 3) throw new ServerError(401, 'Inicia sessão para jogar online.');
      // getUser performs a request to the configured Supabase Auth server. Never
      // trust a client userId, name, metadata or an unverified JWT sub claim.
      const { data, error } = await client.auth.getUser(token);
      if (error || !data.user) {
        if (error?.status && error.status >= 500 || error?.name === 'AuthRetryableFetchError') throw new ServerError(503, 'Não foi possível validar a conta. Tenta novamente quando a rede recuperar.');
        throw new ServerError(401, 'Sessão inválida ou expirada. Inicia sessão novamente.');
      }
      let expiresAt: number;
      try { expiresAt = Number(JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).exp) * 1000; }
      catch { throw new ServerError(401, 'Token inválido.'); }
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new ServerError(401, 'Sessão expirada. Inicia sessão novamente.');
      const { data: profile, error: profileError } = await client.from('profiles').select('id,display_name,vehicle_color').eq('id', data.user.id).setHeader('Authorization', `Bearer ${token}`).single();
      if (profileError || !profile) throw new ServerError(503, 'Não foi possível carregar o perfil. Confirma as migrações e tenta novamente.');
      const values = validateProfile(profile.display_name, profile.vehicle_color);
      return { userId: data.user.id, name: values.display_name, color: values.vehicle_color, expiresAt };
    },
    async saveResult(result) {
      if (!admin) throw new Error('Persistência do servidor não configurada.');
      // Server-generated UUID makes retries idempotent. Client roles cannot write.
      const { error } = await admin.from('competition_results').upsert(result, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw new Error('Não foi possível guardar o resultado.');
    },
    async saveRound(round) {
      if (!admin) throw new Error('Persistência do servidor não configurada.');
      const { data, error } = await admin.rpc('settle_competition_round', { payload: round });
      if (error) throw new Error('Não foi possível guardar a ronda.');
      if (!data || round.entries.some(e => !Number.isSafeInteger(Number(data[e.user_id])) || Number(data[e.user_id]) < 0)) throw new Error('Confirmação de saldo inválida.');
      return Object.fromEntries(round.entries.map(e => [e.user_id, Number(data[e.user_id])]));
    },
    async syncCompetition(payload) {
      if (!admin) throw new Error('Persistência do servidor não configurada.');
      const { data, error } = await admin.rpc('sync_race_competition', { payload });
      if (error) throw new Error('Não foi possível confirmar a fase da competição.');
      return Object.fromEntries(Object.entries(data ?? {}).map(([id, value]) => [id, garageData(value)]));
    },
    async garage(matchId, userId, vehicleId) {
      if (!admin) throw new Error('Garagem do servidor não configurada.');
      const { data: catalog, error: catalogError } = await admin.from('upgrade_catalog').select('kind,version,prices,effect_step');
      if (catalogError || !catalog || catalog.length !== upgradeKinds.length || catalog.some(item => !upgradeKinds.includes(item.kind) || item.version !== upgradeRules.version || JSON.stringify(item.prices) !== JSON.stringify(upgradeRules[item.kind as UpgradeKind].prices) || Number(item.effect_step) !== upgradeRules[item.kind as UpgradeKind].step)) throw new Error('Catálogo incompatível: aplica as migrações e atualiza cliente/servidor.');
      const { data, error } = await admin.rpc('garage_state', { match_id: matchId, target_user: userId, chosen_vehicle: vehicleId });
      if (error) throw new Error('Não foi possível carregar a garagem.');
      return garageData(data);
    },
    async purchase(purchase) {
      if (!admin) throw new Error('Garagem do servidor não configurada.');
      const { data, error } = await admin.rpc('purchase_vehicle_upgrade', purchase);
      if (error) {
        if (['P0001', 'P0002', '23514', '23503'].includes(error.code)) throw new PurchaseRejected('Compra recusada: verifica fase, nível, preço e saldo.');
        throw new Error('Não foi possível confirmar a compra. Repete o mesmo pedido.');
      }
      return garageData(data);
    },
    async getBalance(userId) {
      if (!admin) throw new Error('Economia do servidor não configurada.');
      const { data, error } = await admin.from('player_state').select('balance').eq('user_id', userId).single();
      const balance = Number(data?.balance);
      if (error || !Number.isSafeInteger(balance) || balance < 0) throw new Error('Não foi possível carregar o saldo.');
      return balance;
    },
    async creditRewards(userId, events) {
      if (!admin) throw new Error('Economia do servidor não configurada.');
      const { data, error } = await admin.rpc('credit_race_rewards', { target_user: userId, credits: events });
      const balance = Number(data);
      if (error || !Number.isSafeInteger(balance) || balance < 0) throw new Error('Não foi possível confirmar as moedas.');
      return balance;
    },
  };
}
