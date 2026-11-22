import { GameUI as ui } from '@/constants/game-ui';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { OnlineStatus } from '@/game/multiplayer-client';
import { vehicles } from '@/game/vehicles';
import { useAuth } from '@/auth/auth-provider';
import { router } from 'expo-router';
import TournamentLobby from './tournament-lobby';
import type { TournamentAction } from '@/game/tournament';
import type { VehicleId } from '@/game/vehicles';
import type { PurchaseAction } from './competition-garage';

type Props = {
  visible: boolean; status: OnlineStatus;
  onClose: () => void; onLeave: () => void;
  onConnect: (options: { address: string; code?: string }) => void;
  onCompetition: (action: 'start' | 'retry') => void;
  onTournament: (action: TournamentAction) => void;
  onVehicle: (id: VehicleId) => void;
  onPurchase: (action: PurchaseAction) => void;
};

export default function OnlineMenu({ visible, status, onClose, onLeave, onConnect, onCompetition, onTournament, onVehicle, onPurchase }: Props) {
  const auth = useAuth();
  const [address, setAddress] = useState(process.env.EXPO_PUBLIC_MULTIPLAYER_URL?.trim() || 'https://serrarunner.onrender.com');
  const [code, setCode] = useState('');
  const busy = status.phase === 'connecting' || status.phase === 'reconnecting' || auth.loading;
  const canConnect = !!auth.session && !!auth.profile && !busy;
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
    <SafeAreaView style={styles.backdrop}><View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.heading}><Text style={styles.eyebrow}>RAMP RIVALS / MULTIPLAYER</Text><Text style={styles.title}>Jogar online</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu online" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Fechar</Text></Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {status.message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{status.message}</Text> : null}
        {status.phase === 'reconnecting' && <Text accessibilityLiveRegion="polite" style={styles.message}>Lugar reservado · {status.reconnection?.remainingSeconds ?? 0} s restantes. A corrida continua; comandos e buzina estão neutralizados.</Text>}
        {status.room ? <>
          <Text style={styles.label}>CÓDIGO DE CONVITE</Text>
          <Text selectable style={styles.code}>{status.room.code}</Text>
          <Text style={styles.description}>{status.room.players.length}/4 jogadores{status.ping !== null ? ` · ${status.ping} ms` : ''}. Todos devem usar o mesmo servidor.</Text>
          {!status.tournament && status.room.players.map(player => <View key={player.id} style={styles.player}>
            <View style={[styles.dot, { backgroundColor: player.color ?? vehicles[player.vehicleId].color }]} />
            <Text style={styles.playerName}>{player.name}{player.id === status.room?.sessionId ? ' (tu)' : ''}</Text>
            <Text style={styles.description}>{vehicles[player.vehicleId].name}</Text>
          </View>)}
          {status.tournament && <TournamentLobby state={status.tournament} garage={status.garage} sessionId={status.room.sessionId} available={status.competition?.available ?? false} busy={busy} onAction={onTournament} onVehicle={onVehicle} onPurchase={onPurchase} />}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primary}><Text style={styles.primaryText}>Voltar ao jogo</Text></Pressable>
          {!status.tournament?.started && <>
          <Text style={styles.description}>Competição: uma volta ao circuito. Repor ou trocar de carro cancela a tentativa. Uma interrupção dentro do prazo conserva o progresso; atravessar um setor durante a ausência invalida a tentativa. O cronómetro continua.</Text>
          {status.competition?.message ? <Text style={styles.message}>{status.competition.message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={!status.competition?.available || busy || status.competition?.phase === 'saving' || status.competition?.phase === 'save-error'} onPress={() => onCompetition('start')} style={[styles.primary, (!status.competition?.available || busy || status.competition?.phase === 'saving' || status.competition?.phase === 'save-error') && styles.disabled]}><Text style={styles.primaryText}>Treino individual · guardar volta</Text></Pressable>
          {status.competition?.phase === 'save-error' && <Pressable accessibilityRole="button" onPress={() => onCompetition('retry')} style={styles.secondary}><Text style={styles.secondaryText}>Tentar guardar resultado novamente</Text></Pressable>}
          </>}
          <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}><Text style={styles.secondaryText}>Sair da sala · jogar sozinho</Text></Pressable>
        </> : <>
          <Text style={styles.description}>Até 4 condutores na mesma serra. Cria uma sala ou entra com um código.</Text>
          <Text style={styles.description}>{auth.loading ? 'A recuperar sessão…' : auth.session ? `Perfil: ${auth.profile?.display_name ?? 'a carregar…'}` : 'Inicia sessão para entrar numa sala e guardar resultados. O jogo local continua disponível.'}</Text>
          {!auth.configured && <Text style={styles.message}>Supabase ainda não configurado.</Text>}
          <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push('/account'); }} style={styles.secondary}><Text style={styles.secondaryText}>{auth.session ? 'Gerir conta e perfil' : 'Entrar / Registar'}</Text></Pressable>
          <Text style={styles.label}>SERVIDOR ONLINE</Text>
          <TextInput accessibilityLabel="Endereço do servidor multiplayer" placeholder="https://serrarunner.onrender.com" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} style={styles.input} placeholderTextColor={ui.muted} />
          <Text style={styles.description}>Os jogadores da sala devem usar o mesmo servidor.</Text>
          <Pressable accessibilityRole="button" disabled={!canConnect || !address.trim()} onPress={() => onConnect({ address })} style={[styles.primary, (!canConnect || !address.trim()) && styles.disabled]}><Text style={styles.primaryText}>Criar sala</Text></Pressable>
          <View style={styles.joinRow}>
            <TextInput accessibilityLabel="Código da sala" placeholder="Código de 8 caracteres" value={code} onChangeText={value => setCode(value.toUpperCase().replace(/[^A-F0-9]/g, ''))} maxLength={8} autoCapitalize="characters" autoCorrect={false} editable={!busy} style={[styles.input, styles.codeInput]} placeholderTextColor={ui.muted} />
            <Pressable accessibilityRole="button" disabled={!canConnect || !address.trim() || code.length !== 8} onPress={() => onConnect({ address, code })} style={[styles.secondary, (!canConnect || !address.trim() || code.length !== 8) && styles.disabled]}><Text style={styles.secondaryText}>Entrar na sala</Text></Pressable>
          </View>
          {busy && <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar ligação</Text></Pressable>}
        </>}
      </ScrollView>
    </View></SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#080b0de6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 600, maxHeight: '100%', borderWidth: 1, borderColor: ui.border, padding: 20, backgroundColor: ui.background, borderRadius: 12, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1 },
  eyebrow: { color: ui.muted, fontSize: 10, fontWeight: '600', letterSpacing: 2 },
  title: { color: ui.text, fontSize: 26, fontWeight: '600', marginTop: 4 },
  scroll: { flexShrink: 1 },
  content: { gap: 12, paddingBottom: 12 },
  description: { color: ui.muted, fontSize: 13, lineHeight: 20 },
  label: { color: ui.muted, fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 4 },
  input: { minHeight: 44, borderWidth: 1, borderColor: ui.border, borderRadius: 6, padding: 12, color: ui.text, backgroundColor: ui.surface, fontSize: 13 },
  primary: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.accent, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: ui.ink, fontSize: 13, fontWeight: '600' },
  secondary: { minHeight: 44, padding: 12, borderRadius: 6, backgroundColor: ui.raised, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: ui.text, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  joinRow: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1 },
  code: { color: ui.text, fontSize: 32, fontWeight: '600', letterSpacing: 4 },
  message: { color: ui.accent, fontSize: 13, lineHeight: 20 },
  player: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ui.border },
  dot: { width: 10, height: 10, borderRadius: 2 },
  playerName: { flex: 1, color: ui.text, fontSize: 13, fontWeight: '700' },
});
