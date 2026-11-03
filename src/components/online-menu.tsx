import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { OnlineStatus } from '@/game/multiplayer-client';
import { vehicles } from '@/game/vehicles';

type Props = {
  visible: boolean; status: OnlineStatus;
  onClose: () => void; onLeave: () => void;
  onConnect: (options: { address: string; name: string; code?: string }) => void;
};

export default function OnlineMenu({ visible, status, onClose, onLeave, onConnect }: Props) {
  const [address, setAddress] = useState(process.env.EXPO_PUBLIC_MULTIPLAYER_URL ?? '');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const busy = status.phase === 'connecting' || status.phase === 'reconnecting';
  return <Modal visible={visible} transparent animationType="fade" supportedOrientations={['landscape', 'portrait']} onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.panel}>
      <View style={styles.header}>
        <View style={styles.heading}><Text style={styles.eyebrow}>SERRA / MULTIPLAYER</Text><Text style={styles.title}>A serra é melhor em grupo.</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Fechar menu online" onPress={onClose} style={styles.secondary}><Text style={styles.secondaryText}>Fechar ×</Text></Pressable>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {status.message ? <Text accessibilityLiveRegion="polite" style={styles.message}>{status.message}</Text> : null}
        {status.room ? <>
          <Text style={styles.label}>CÓDIGO DA SALA · PARTILHA COM OS TEUS AMIGOS</Text>
          <Text selectable style={styles.code}>{status.room.code}</Text>
          <Text style={styles.description}>{status.room.players.length}/4 jogadores{status.ping !== null ? ` · ${status.ping} ms` : ''}. Todos devem usar o mesmo servidor.</Text>
          {status.room.players.map(player => <View key={player.id} style={styles.player}>
            <View style={[styles.dot, { backgroundColor: vehicles[player.vehicleId].color }]} />
            <Text style={styles.playerName}>{player.name}{player.id === status.room?.sessionId ? ' (tu)' : ''}</Text>
            <Text style={styles.description}>{vehicles[player.vehicleId].name}</Text>
          </View>)}
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.primary}><Text style={styles.primaryText}>Voltar ao jogo</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}><Text style={styles.secondaryText}>Sair da sala · jogar sozinho</Text></Pressable>
        </> : <>
          <Text style={styles.description}>Cria uma sala para até 4 jogadores ou entra com o código de um amigo. Cada jogador mantém o seu veículo.</Text>
          <Text style={styles.label}>O TEU NOME</Text>
          <TextInput accessibilityLabel="O teu nome online" placeholder="Condutor" value={name} onChangeText={setName} maxLength={20} editable={!busy} style={styles.input} placeholderTextColor="#7b8975" />
          <Text style={styles.label}>SERVIDOR ONLINE</Text>
          <TextInput accessibilityLabel="Endereço do servidor multiplayer" placeholder="https://serra-runner.onrender.com" value={address} onChangeText={setAddress} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy} style={styles.input} placeholderTextColor="#7b8975" />
          <Text style={styles.description}>Usa o endereço do servidor publicado. O servidor da sala mantém o mundo e os movimentos sincronizados.</Text>
          <Pressable accessibilityRole="button" disabled={busy || !address.trim()} onPress={() => onConnect({ address, name })} style={[styles.primary, (busy || !address.trim()) && styles.disabled]}><Text style={styles.primaryText}>Criar sala</Text></Pressable>
          <View style={styles.joinRow}>
            <TextInput accessibilityLabel="Código da sala" placeholder="Código de 8 caracteres" value={code} onChangeText={value => setCode(value.toUpperCase().replace(/[^A-F0-9]/g, ''))} maxLength={8} autoCapitalize="characters" autoCorrect={false} editable={!busy} style={[styles.input, styles.codeInput]} placeholderTextColor="#7b8975" />
            <Pressable accessibilityRole="button" disabled={busy || !address.trim() || code.length !== 8} onPress={() => onConnect({ address, name, code })} style={[styles.secondary, (busy || !address.trim() || code.length !== 8) && styles.disabled]}><Text style={styles.secondaryText}>Entrar na sala</Text></Pressable>
          </View>
          {busy && <Pressable accessibilityRole="button" onPress={onLeave} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar ligação</Text></Pressable>}
        </>}
      </ScrollView>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#14261ee6', justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: { width: '100%', maxWidth: 600, maxHeight: '100%', padding: 20, backgroundColor: '#f1efdf', borderRadius: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1 },
  eyebrow: { color: '#63785d', fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#263f33', fontSize: 24, fontWeight: '800', marginTop: 4 },
  scroll: { flexShrink: 1 },
  content: { gap: 12, paddingBottom: 4 },
  description: { color: '#5b6b59', fontSize: 12, lineHeight: 18 },
  label: { color: '#4d6550', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#c2ccb8', borderRadius: 12, padding: 12, color: '#263f33', backgroundColor: '#faf8ee', fontSize: 13 },
  primary: { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: '#e6bd6a', alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#3b422e', fontSize: 12, fontWeight: '800' },
  secondary: { minHeight: 44, padding: 12, borderRadius: 12, backgroundColor: '#dfe4d3', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#30483d', fontSize: 12, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  joinRow: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1 },
  code: { color: '#263f33', fontSize: 32, fontWeight: '800', letterSpacing: 4 },
  message: { color: '#77583b', fontSize: 12, lineHeight: 18 },
  player: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingVertical: 7 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  playerName: { flex: 1, color: '#30483d', fontSize: 13, fontWeight: '700' },
});
