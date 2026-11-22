import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, processLock, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { fetchWithTimeout } from './request';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
export const authConfigured = Boolean(url && key);
let client: SupabaseClient | null = null;

// Called after mount; static web export must never touch browser storage.
export function getSupabase() {
  if (!url || !key) throw new Error('Autenticação indisponível: falta configurar o Supabase. Podes continuar a jogar localmente.');
  if (key.startsWith('sb_secret_')) throw new Error('Configuração inválida: o cliente exige uma chave pública Supabase.');
  if (!client) client = createClient(url, key, {
    auth: {
      ...(Platform.OS !== 'web' ? { storage: AsyncStorage, lock: processLock } : {}),
      storageKey: 'ramp-rivals-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    },
    global: { fetch: fetchWithTimeout },
  });
  return client;
}
