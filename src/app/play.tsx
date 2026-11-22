import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import type { Client, Room } from 'colyseus.js';
import { useAuth } from '@/auth/auth-provider';
import { isVehicleId, NETWORK_VERSION, ROOM_NAME, serverAddress } from '@/game/network-types';

const Game = lazy(() => import('@/components/driving-scene'));
const subscribe = () => () => {};
const onDevice = () => true;
const onServer = () => false;

export default function Play() {
  const { car, course, address, code, mode } = useLocalSearchParams<{ car?: string; course?: string; address?: string; code?: string; mode?: string }>();
  const vehicle = isVehicleId(car) ? car : 'jeep';
  const track = course === 'trail' || course === 'race' || course === 'challenge' ? course : 'garage';
  const { getAccessToken } = useAuth();
  const mounted = useSyncExternalStore(subscribe, onDevice, onServer);
  const [connection, setConnection] = useState<{room: Room; client: Client; onAdopt: () => void}>();
  const ready = mounted && (mode !== 'online' || !!connection);
  const [error, setError] = useState('');
  useEffect(() => {
    if (mode !== 'online') return;
    let adopted = false;
    let active = true;
    let joined: Room | undefined;
    const timeout = setTimeout(() => {
      active = false; setError('A sala não respondeu a tempo. Verifica a ligação e tenta novamente.');
    }, 15000);
    async function enter() {
      const token = await getAccessToken();
      if (!active) return;
      const { Client } = await import('colyseus.js');
      if (!active) return;
      const client = new Client(serverAddress(address ?? ''));
      const options = { accessToken: token, vehicleId: vehicle, version: NETWORK_VERSION };
      joined = code ? await client.joinById(code, options) : await client.create(ROOM_NAME, options);
      if (!active) { await joined.leave(); return; }
      setConnection({ room: joined, client, onAdopt: () => { adopted = true; } });
    }
    void enter().catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível entrar na sala.'); }).finally(() => clearTimeout(timeout));
    return () => {
      active = false;
      clearTimeout(timeout);
      if (!adopted && joined?.connection.isOpen) void joined.leave().catch(() => {});
    };
  }, [address, code, getAccessToken, mode, vehicle]);
  const loading = <View style={styles.center}><Text style={styles.label}>{error || (mode === 'online' && !ready ? 'A entrar na sala…' : 'A preparar a pista…')}</Text>
    <Pressable accessibilityRole="button" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text>Voltar ao menu</Text></Pressable></View>;
  return ready ? <Suspense fallback={loading}><Game initialCar={vehicle} course={track} connection={connection} /></Suspense> : loading;
}
const styles = StyleSheet.create({center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:'#202124',gap:20},label:{color:'#fff',fontWeight:'700'},back:{backgroundColor:'#ffd12d',padding:15,borderRadius:8}});
