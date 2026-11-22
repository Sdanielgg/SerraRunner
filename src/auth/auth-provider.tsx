import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { authConfigured, getSupabase } from './supabase';
import { authErrorMessage, profileRules, validateProfile, type CompetitionResult, type Profile } from './profile';
import { authRules } from './config';
import type { GameHistory } from './game-history';

function useAuthState() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(authConfigured);
  const [message, setMessage] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const currentUser = useRef<string | undefined>(undefined);
  const explicitLogout = useRef(false);

  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    let initialEvent = false;
    let client: ReturnType<typeof getSupabase>;
    try { client = getSupabase(); }
    catch (error) { void Promise.resolve().then(() => { if (active) { setMessage(authErrorMessage(error)); setLoading(false); } }); return () => { active = false; }; }
    const receiveSession = (next: Session | null) => {
      if (currentUser.current !== next?.user.id) { setProfile(null); setProfileLoading(false); }
      currentUser.current = next?.user.id;
      setSession(next);
    };
    const { data: { subscription } } = client.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      initialEvent = true;
      if (event === 'SIGNED_OUT' && currentUser.current && !explicitLogout.current) setMessage('A sessão expirou. Inicia sessão novamente.');
      receiveSession(next); setLoading(false);
    });
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage(authErrorMessage(error));
      if (!initialEvent) receiveSession(data.session);
      setLoading(false);
    }).catch(error => { if (active) { setMessage(authErrorMessage(error)); setLoading(false); } });
    if (Platform.OS !== 'web' && AppState.currentState === 'active') void client.auth.startAutoRefresh();
    const appSubscription = AppState.addEventListener('change', state => {
      if (Platform.OS === 'web') return;
      if (state === 'active') void client.auth.startAutoRefresh();
      else void client.auth.stopAutoRefresh();
    });
    return () => { active = false; subscription.unsubscribe(); appSubscription.remove(); if (Platform.OS !== 'web') void client.auth.stopAutoRefresh(); };
  }, []);

  const loadProfile = useCallback(async () => {
    const id = currentUser.current;
    if (!id) return;
    setProfileLoading(true);
    try {
      const { data, error } = await getSupabase().from('profiles').select('id,display_name,vehicle_color').eq('id', id).single();
      if (error) throw error;
      if (currentUser.current === id) setProfile(data as Profile);
    } catch (error) { if (currentUser.current === id) setMessage(authErrorMessage(error)); }
    finally { if (currentUser.current === id) setProfileLoading(false); }
  }, []);
  useEffect(() => { if (session?.user.id) void loadProfile(); }, [session?.user.id, loadProfile]);

  const getAccessToken = useCallback(async () => {
    const client = getSupabase();
    let { data: { session: next }, error } = await client.auth.getSession();
    if (error) throw new Error(authErrorMessage(error));
    if (!next) throw new Error('Inicia sessão para jogar online.');
    if ((next.expires_at ?? 0) * 1000 < Date.now() + authRules.refreshBeforeExpiryMs) {
      const refreshed = await client.auth.refreshSession();
      next = refreshed.data.session; error = refreshed.error;
      if (error) throw new Error(authErrorMessage(error));
    }
    if (!next || (next.expires_at ?? 0) * 1000 <= Date.now()) throw new Error('A sessão expirou. Inicia sessão novamente.');
    return next.access_token;
  }, []);

  return {
    configured: authConfigured, session, loading, message, setMessage, profile, profileLoading, loadProfile, getAccessToken,
    async login(email: string, password: string) {
      const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
      setMessage('');
    },
    async register(email: string, password: string, name: string, color: string) {
      const values = validateProfile(name, color);
      if (password.length < profileRules.passwordMin) throw new Error('A palavra-passe deve ter pelo menos 8 caracteres.');
      const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password, options: { data: values } });
      if (error) throw error;
      setMessage(data.session ? 'Conta criada.' : 'Consulta o email para confirmar a conta. Se já tens conta, inicia sessão.');
      return !data.session;
    },
    async confirm(email: string, token: string) {
      const { error } = await getSupabase().auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'signup' });
      if (error) throw error;
      setMessage('Email confirmado.');
    },
    async resend(email: string) {
      const { error } = await getSupabase().auth.resend({ type: 'signup', email: email.trim() });
      if (error) throw error;
      setMessage('Se a conta aguarda confirmação, receberás um novo email.');
    },
    async logout() {
      explicitLogout.current = true;
      try {
        // Local scope removes this device's persisted refresh token, including offline.
        const { error } = await getSupabase().auth.signOut({ scope: 'local' });
        if (error && currentUser.current) throw error;
        // The SDK event owns session state. A new login may already have
        // completed while the logout revocation request was waiting for network.
        if (!currentUser.current) setMessage(error ? 'Sessão terminada neste dispositivo. A revogação no servidor não foi confirmada por falha de rede.' : 'Sessão terminada neste dispositivo.');
      } finally { explicitLogout.current = false; }
    },
    async saveProfile(name: string, color: string) {
      const id = currentUser.current;
      if (!id) throw new Error('Inicia sessão novamente.');
      const values = validateProfile(name, color);
      const { data, error } = await getSupabase().from('profiles').update(values).eq('id', id).select('id,display_name,vehicle_color').single();
      if (error) throw error;
      if (currentUser.current === id) { setProfile(data as Profile); setMessage('Perfil guardado.'); }
    },
    async balance(): Promise<number> {
      const id = currentUser.current;
      if (!id) throw new Error('Inicia sessão novamente.');
      const { data, error } = await getSupabase().from('player_state').select('balance').eq('user_id', id).single();
      if (error) throw error;
      return Number(data.balance);
    },
    async results(): Promise<CompetitionResult[]> {
      const id = currentUser.current;
      if (!id) return [];
      const { data, error } = await getSupabase().from('competition_results').select('id,vehicle_id,course_id,upgrade_levels,elapsed_ms,created_at,points_awarded,round_number').eq('user_id', id).order('created_at', { ascending: false }).limit(20);
      if (error) throw error;
      return data as CompetitionResult[];
    },
    async history(): Promise<GameHistory> {
      const id = currentUser.current; if (!id) throw new Error('Inicia sessão novamente.');
      const client = getSupabase();
      const [balance, statistics, movements, competitions, upgrades, rounds] = await Promise.all([
        client.from('player_state').select('balance').eq('user_id', id).single(),
        client.from('profile_statistics').select('rounds,wins,finishes,recoveries,coins_earned,coins_spent,competitions_won,best_time_ms').eq('user_id', id).maybeSingle(),
        client.from('money_movements').select('id,amount,kind,vehicle_id,created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(20),
        client.from('competition_participants').select('competition_id,vehicle_id,points').eq('user_id', id).limit(20),
        client.from('vehicle_upgrades').select('competition_id,vehicle_id,engine,tank,air').eq('user_id', id).limit(20),
        client.from('race_rounds').select('id,round_number,winner_user_id,created_at').order('created_at', { ascending: false }).limit(20),
      ]);
      for (const response of [balance, statistics, movements, competitions, upgrades, rounds]) if (response.error) throw response.error;
      if (currentUser.current !== id) throw new Error('A conta mudou. Carrega os dados novamente.');
      return { balance: Number(balance.data!.balance), statistics: statistics.data, movements: movements.data ?? [], competitions: competitions.data ?? [], upgrades: upgrades.data ?? [], rounds: rounds.data ?? [] } as GameHistory;
    },
  };
}
const AuthContext = createContext<ReturnType<typeof useAuthState> | null>(null);
export function AuthProvider({ children }: PropsWithChildren) { const auth = useAuthState(); return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>; }
export function useAuth() { const auth = useContext(AuthContext); if (!auth) throw new Error('AuthProvider em falta.'); return auth; }
